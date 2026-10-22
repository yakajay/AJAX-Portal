import { useState } from 'react';
import { Tabs } from '../../components/ui';
import PortalRequests from './PortalRequests';
import PortalAudit from './PortalAudit';
import PortalAddressTickets from './PortalAddressTickets';
import { usePortalStats } from './shared';

type Tab = 'requests' | 'address' | 'activity';

/** What clients are asking of the platform (delete requests, address tickets) and everything the platform has done (activity log). */
const PortalSupport = () => {
  const [tab, setTab] = useState<Tab>('requests');
  const stats = usePortalStats();
  return (
    <div className="space-y-6">
      <Tabs<Tab>
        tabs={[
          { id: 'requests', label: 'Delete requests', badge: stats.data?.pendingDeleteRequests },
          { id: 'address', label: 'Address tickets', badge: stats.data?.pendingAddressRequests },
          { id: 'activity', label: 'Activity log' }
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'requests' ? <PortalRequests /> : tab === 'address' ? <PortalAddressTickets onChanged={() => void stats.reload()} /> : <PortalAudit />}
    </div>
  );
};

export default PortalSupport;
