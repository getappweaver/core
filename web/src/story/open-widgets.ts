import type { StoryWidgetOpenedEvent } from './types';

type StoryOpenWidget = Pick<StoryWidgetOpenedEvent, 'command' | 'subcommand'>;

const openWidgetKeys = new Set<string>();

function widgetKey(widget: StoryOpenWidget): string {
  return `${widget.command}:${widget.subcommand}`;
}

export function setStoryOpenWidgets(widgets: StoryOpenWidget[]): void {
  openWidgetKeys.clear();

  for (const widget of widgets) {
    openWidgetKeys.add(widgetKey(widget));
  }
}

export function isStoryWidgetOpen(widget: StoryOpenWidget): boolean {
  return openWidgetKeys.has(widgetKey(widget));
}
