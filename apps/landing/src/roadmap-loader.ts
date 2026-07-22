import type { NostrEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';

import {
  COMMENT_KIND,
  DELETE_KIND,
  ISSUE_KIND,
  PLUGIN_KIND,
  PROFILE_KIND,
  PROJECT_KIND,
  STATUS_CLOSED_KIND,
  STATUS_DRAFT_KIND,
  STATUS_OPEN_KIND,
  STATUS_RESOLVED_KIND,
  TRACKER_KIND,
  WORKFLOW_KIND,
  ZAP_KIND,
  repoRelaysForProject,
  uniqueRoadmapRelays,
} from '@src/commands/roadmap/model';
import {
  NIP65_RELAY_LIST_KIND,
  PROFILE_RELAYS_FOR_QUERY,
} from '@src/nostr/nip65';

const QUERY_MAX_WAIT_MS = 4_000;
const EVENT_LIMIT = 500;
const FILTER_VALUE_CHUNK_SIZE = 100;

export type RoadmapTarget = {
  ownerPubkey: string;
  repoId: string;
  relayHints: string[];
};

export type RoadmapSnapshot = {
  events: NostrEvent[];
  relays: string[];
};

type LoadRoadmapSnapshotProps = {
  target: RoadmapTarget;
  boardKey: string;
};

function uniqueEvents(events: NostrEvent[]): NostrEvent[] {
  return [...new Map(events.map((event) => [event.id, event])).values()];
}

function latestEvent(events: NostrEvent[]): NostrEvent | null {
  return events.reduce<NostrEvent | null>((latest, event) => {
    if (
      latest === null ||
      event.created_at > latest.created_at ||
      (event.created_at === latest.created_at && event.id > latest.id)
    ) {
      return event;
    }

    return latest;
  }, null);
}

function latestEventsByPubkey(events: NostrEvent[]): NostrEvent[] {
  const latest = new Map<string, NostrEvent>();

  for (const event of events) {
    const current = latest.get(event.pubkey);

    if (
      !current ||
      event.created_at > current.created_at ||
      (event.created_at === current.created_at && event.id > current.id)
    ) {
      latest.set(event.pubkey, event);
    }
  }

  return [...latest.values()];
}

function tagValues(event: NostrEvent, name: string): string[] {
  return event.tags
    .filter((tag) => tag[0] === name && tag[1])
    .map((tag) => tag[1]);
}

function eventAddress(event: NostrEvent): string | null {
  const identifier = tagValues(event, 'd')[0];

  return identifier ? `${event.kind}:${event.pubkey}:${identifier}` : null;
}

function chunks(values: string[]): string[][] {
  const result: string[][] = [];

  for (let index = 0; index < values.length; index += FILTER_VALUE_CHUNK_SIZE) {
    result.push(values.slice(index, index + FILTER_VALUE_CHUNK_SIZE));
  }

  return result;
}

export async function loadRoadmapSnapshot({
  target,
  boardKey,
}: LoadRoadmapSnapshotProps): Promise<RoadmapSnapshot> {
  const pool = new SimplePool();
  const openedRelays = new Set<string>();
  const targetRelays = uniqueRoadmapRelays(target.relayHints);
  const discoveryRelays = uniqueRoadmapRelays([
    ...targetRelays,
    ...PROFILE_RELAYS_FOR_QUERY,
  ]);

  if (targetRelays.length === 0) {
    throw new Error('Roadmap target has no valid repository relay hints.');
  }

  discoveryRelays.forEach((relay) => openedRelays.add(relay));

  try {
    const [projectEvents, relayListEvents] = await Promise.all([
      pool.querySync(
        targetRelays,
        {
          kinds: [PROJECT_KIND],
          authors: [target.ownerPubkey],
          '#d': [target.repoId],
          limit: 1,
        },
        { maxWait: QUERY_MAX_WAIT_MS },
      ),
      pool.querySync(
        discoveryRelays,
        {
          kinds: [NIP65_RELAY_LIST_KIND],
          authors: [target.ownerPubkey],
          limit: 1,
        },
        { maxWait: QUERY_MAX_WAIT_MS },
      ),
    ]);
    const project = latestEvent(projectEvents);

    if (!project) {
      throw new Error(
        `Roadmap repository ${target.repoId} was not found on ${targetRelays.join(', ')}.`,
      );
    }

    const relayList = latestEvent(relayListEvents);
    const relayListsByPubkey = new Map<string, NostrEvent>();

    if (relayList) {
      relayListsByPubkey.set(relayList.pubkey, relayList);
    }

    const repoRelays = repoRelaysForProject(project, relayListsByPubkey);
    const dataRelays = uniqueRoadmapRelays([
      ...targetRelays,
      ...repoRelays,
    ]);

    dataRelays.forEach((relay) => openedRelays.add(relay));

    const projectAddress = `${PROJECT_KIND}:${target.ownerPubkey}:${target.repoId}`;
    const [workflowEvents, issueEvents, activityEvents, pluginEvents] =
      await Promise.all([
        pool.querySync(
          dataRelays,
          {
            kinds: [WORKFLOW_KIND],
            authors: [target.ownerPubkey],
            '#a': [projectAddress],
            limit: 100,
          },
          { maxWait: QUERY_MAX_WAIT_MS },
        ),
        pool.querySync(
          dataRelays,
          {
            kinds: [ISSUE_KIND],
            '#a': [projectAddress],
            limit: EVENT_LIMIT,
          },
          { maxWait: QUERY_MAX_WAIT_MS },
        ),
        pool.querySync(
          dataRelays,
          {
            kinds: [
              STATUS_OPEN_KIND,
              STATUS_RESOLVED_KIND,
              STATUS_CLOSED_KIND,
              STATUS_DRAFT_KIND,
              COMMENT_KIND,
            ],
            '#a': [projectAddress],
            limit: EVENT_LIMIT,
          },
          { maxWait: QUERY_MAX_WAIT_MS },
        ),
        pool.querySync(
          dataRelays,
          {
            kinds: [PLUGIN_KIND],
            '#a': [projectAddress],
            limit: 100,
          },
          { maxWait: QUERY_MAX_WAIT_MS },
        ),
      ]);
    const workflows = uniqueEvents(workflowEvents);
    const requestedWorkflow = workflows.find(
      (event) => tagValues(event, 'd')[0] === boardKey,
    );

    if (!requestedWorkflow) {
      throw new Error(
        `Roadmap workflow ${boardKey} was not found for repository ${target.repoId}.`,
      );
    }

    const workflowAddresses = workflows
      .map(eventAddress)
      .filter((address): address is string => address !== null);
    const issueIds = uniqueEvents(issueEvents).map((event) => event.id);
    const trackerAddressValues = [projectAddress, ...workflowAddresses];
    const [trackerGroups, dependentGroups] = await Promise.all([
      Promise.all(
        chunks(trackerAddressValues).map((addresses) =>
          pool.querySync(
            dataRelays,
            {
              kinds: [TRACKER_KIND],
              authors: [target.ownerPubkey],
              '#a': addresses,
              limit: EVENT_LIMIT,
            },
            { maxWait: QUERY_MAX_WAIT_MS },
          ),
        ),
      ),
      Promise.all(
        chunks(issueIds).map((ids) =>
          pool.querySync(
            dataRelays,
            {
              kinds: [DELETE_KIND, ZAP_KIND],
              '#e': ids,
              limit: EVENT_LIMIT,
            },
            { maxWait: QUERY_MAX_WAIT_MS },
          ),
        ),
      ),
    ]);
    const graphEvents = uniqueEvents([
      project,
      ...(relayList ? [relayList] : []),
      ...workflows,
      ...issueEvents,
      ...activityEvents,
      ...pluginEvents,
      ...trackerGroups.flat(),
      ...dependentGroups.flat(),
    ]);
    const relevantAuthorPubkeys = [
      ...new Set(
        graphEvents
          .filter(
            (event) =>
              event.kind === PROJECT_KIND ||
              event.kind === WORKFLOW_KIND ||
              event.kind === ISSUE_KIND ||
              event.kind === COMMENT_KIND,
          )
          .map((event) => event.pubkey),
      ),
    ];
    const profileRelays = uniqueRoadmapRelays([
      ...dataRelays,
      ...PROFILE_RELAYS_FOR_QUERY,
    ]);

    profileRelays.forEach((relay) => openedRelays.add(relay));

    const profileGroups = await Promise.all(
      chunks(relevantAuthorPubkeys).map((authors) =>
        pool.querySync(
          profileRelays,
          {
            kinds: [PROFILE_KIND],
            authors,
            limit: authors.length,
          },
          { maxWait: QUERY_MAX_WAIT_MS },
        ),
      ),
    );
    const profiles = latestEventsByPubkey(uniqueEvents(profileGroups.flat()));

    return {
      events: uniqueEvents([...graphEvents, ...profiles]),
      relays: repoRelays.length > 0 ? repoRelays : dataRelays,
    };
  } finally {
    pool.close([...openedRelays]);
  }
}
