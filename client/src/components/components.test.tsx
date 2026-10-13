import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { BarChart, HBar, LineChart } from './charts/Charts';
import { Modal, Tabs, Badge, statusTone } from './ui';
import PermissionEditor from './admin/PermissionEditor';

describe('charts', () => {
  it('give screen readers the data as text', () => {
    render(<BarChart label="Leave days" data={[{ label: 'May', value: 2 }, { label: 'Jun', value: 5 }]} unit="d" />);
    expect(screen.getByRole('img', { name: 'Leave days: May 2d, Jun 5d' })).toBeInTheDocument();
  });

  it('render a line chart and a horizontal bar list', () => {
    render(<>
      <LineChart label="Attendance" data={[{ label: 'Mon', value: 50 }, { label: 'Tue', value: 75 }]} unit="%" />
      <HBar label="Headcount" data={[{ label: 'Eng', value: 4 }, { label: 'Sales', value: 2 }]} />
    </>);
    expect(screen.getByRole('img', { name: /Attendance: Mon 50%, Tue 75%/ })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Headcount' }).children).toHaveLength(2);
  });

  it('handle empty and all-zero data without crashing', () => {
    render(<><BarChart label="Empty" data={[]} /><LineChart label="Zeros" data={[{ label: 'a', value: 0 }]} /></>);
    expect(screen.getByRole('img', { name: 'Zeros: a 0' })).toBeInTheDocument();
  });
});

describe('ui', () => {
  it('Tabs switch and report selection', async () => {
    const Harness = () => {
      const [tab, setTab] = useState<'a' | 'b'>('a');
      return <Tabs tabs={[{ id: 'a', label: 'First' }, { id: 'b', label: 'Second', badge: 3 }]} value={tab} onChange={setTab} />;
    };
    render(<Harness />);
    expect(screen.getByRole('tab', { name: 'First' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: /Second/ }));
    expect(screen.getByRole('tab', { name: /Second/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('Modal closes on Escape and the close button, and renders nothing when closed', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Modal open title="Hello" onClose={onClose}>body</Modal>);
    expect(screen.getByRole('dialog', { name: 'Hello' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    rerender(<Modal open={false} title="Hello" onClose={onClose}>body</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('maps statuses to tones', () => {
    expect(statusTone('Approved')).toBe('green');
    expect(statusTone('Pending Manager')).toBe('amber');
    expect(statusTone('Breached')).toBe('rose');
    expect(statusTone('Whatever')).toBe('slate');
    render(<Badge tone="green">ok</Badge>);
    expect(screen.getByText('ok')).toBeInTheDocument();
  });
});

describe('PermissionEditor', () => {
  const Harness = ({ initial }: { initial: string[] }) => {
    const [value, setValue] = useState(initial);
    return <><PermissionEditor value={value} onChange={setValue} /><output data-testid="out">{value.join(',')}</output></>;
  };

  it('toggles global and per-area tokens', async () => {
    render(<Harness initial={['read']} />);
    await userEvent.click(screen.getByLabelText('write'));
    expect(screen.getByTestId('out')).toHaveTextContent('read,write');
    await userEvent.click(screen.getByLabelText('write')); // un-toggle
    await userEvent.click(screen.getByText('Fine-tune by area'));
    await userEvent.click(screen.getByLabelText('Payroll write'));
    expect(screen.getByTestId('out')).toHaveTextContent('read,payroll:write');
    await userEvent.click(screen.getByLabelText('Payroll write'));
    expect(screen.getByTestId('out')).toHaveTextContent(/^read$/);
  });

  it('shows area rows as granted (and locked) when the global token is on', async () => {
    render(<Harness initial={['read', 'write']} />);
    await userEvent.click(screen.getByText('Fine-tune by area'));
    const box = screen.getByLabelText('Payroll write');
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
  });
});
