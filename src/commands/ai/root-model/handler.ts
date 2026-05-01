import {
  readOpencodeConfigAsync,
  setOpencodeRootModel,
} from '@src/backends/opencode-config';

type HandleAiRootModelProps = {
  dmBotRoot: string;
  selected: string | undefined;
};

export async function handleAiRootModel(
  props: HandleAiRootModelProps,
): Promise<string> {
  const selected = props.selected?.trim() ?? '';

  if (selected.length === 0) {
    const config = await readOpencodeConfigAsync(props.dmBotRoot);

    return `OpenCode root model: ${config.rootModel ?? '(none)'}`;
  }

  if (selected.toLowerCase() === 'reset') {
    await setOpencodeRootModel(props.dmBotRoot, null);

    return 'Cleared OpenCode root model.';
  }

  await setOpencodeRootModel(props.dmBotRoot, selected);

  return `Set OpenCode root model: ${selected}`;
}
