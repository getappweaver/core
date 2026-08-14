import { WebButton } from './WebButton';

type ComposerInterventionButtonProps = {
  active: boolean;
  disabled: boolean;
  onToggle: () => void;
};

export function ComposerInterventionButton(
  props: ComposerInterventionButtonProps,
) {
  return (
    <WebButton
      type="button"
      class="composer-intervention-button"
      classList={{ 'composer-intervention-button--active': props.active }}
      disabled={props.disabled}
      onClick={props.onToggle}
      title="Toggle pre/post tool intervention"
      aria-label="Toggle tool intervention mode"
      aria-pressed={props.active}
    >
      INT
    </WebButton>
  );
}
