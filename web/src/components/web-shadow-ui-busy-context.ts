import type { Accessor } from 'solid-js';
import { createContext } from 'solid-js';

export const WebShadowUiBusyContext = createContext<Accessor<boolean>>(
  () => false,
);
