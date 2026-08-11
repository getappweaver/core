import { WebButton } from './WebButton';

type ComposerSkillsButtonProps = {
  iconUrl: string;
  disabled: boolean;
  onOpen: () => void;
};

export function ComposerSkillsButton(props: ComposerSkillsButtonProps) {
  return (
    <WebButton
      type="button"
      class="composer-skills-button"
      disabled={props.disabled}
      onClick={props.onOpen}
      title="AI configuration"
      aria-label="Open AI configuration"
    >
      <img src={props.iconUrl} alt="" aria-hidden="true" />
    </WebButton>
  );
}
