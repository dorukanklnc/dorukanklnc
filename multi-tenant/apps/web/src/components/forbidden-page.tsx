import { Panel } from '@repo/ui';
import { ForbiddenState } from './states';

/** Rendered by pages the current member may not open (navigation already hides them). */
export function ForbiddenPage() {
  return (
    <Panel className="mt-2">
      <ForbiddenState />
    </Panel>
  );
}
