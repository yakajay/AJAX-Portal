import { useState } from 'react';
import { Tabs } from '../../components/ui';
import PortalRequests from './PortalRequests';
import PortalAudit from './PortalAudit';

type Tab = 'requests' | 'activity';

/** What clients are asking of the platform (delete requests) and everything the platform has done (activity log). */
const PortalSupport = () => {
  const [tab, setTab] = useState<Tab>('requests');
  return (
    <div className="space-y-6">
      <Tabs<Tab> tabs={[{ id: 'requests', label: 'Delete requests' }, { id: 'activity', label: 'Activity log' }]} value={tab} onChange={setTab} />
      {tab === 'requests' ? <PortalRequests /> : <PortalAudit />}
    </div>
  );
};

export default PortalSupport;
