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
      title="Skills manager"
      aria-label="Open skills manager"
    >
      <img src={props.iconUrl} alt="" aria-hidden="true" />
    </WebButton>
  );
}
