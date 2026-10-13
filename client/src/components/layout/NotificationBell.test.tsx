import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import { I18nProvider } from '../../lib/i18n';
import * as api from '../../lib/api';

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const note = (id: string, title: string, read: boolean, link = '/leave') => ({ id, type: 'leave', title, body: '', link, readAt: read ? '2026-10-01T00:00:00Z' : null, createdAt: new Date().toISOString() });

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.spyOn(api, 'apiJson').mockResolvedValue({ unread: 2, items: [note('n1', 'Leave approved', false), note('n2', 'Payslip ready', false, '/payslips'), note('n3', 'Old news', true)] });
    vi.spyOn(api, 'apiSend').mockResolvedValue({});
  });

  const setup = () => render(<I18nProvider><MemoryRouter><NotificationBell /><Where /></MemoryRouter></I18nProvider>);

  it('shows the unread count on the bell', async () => {
    setup();
    expect(await screen.findByRole('button', { name: /Notifications \(2 unread\)/ })).toBeInTheDocument();
  });

  it('opens the list, marks one read and follows its link', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    await userEvent.click(await screen.findByText('Payslip ready'));
    expect(api.apiSend).toHaveBeenCalledWith('PATCH', '/user/notifications/n2/read');
    expect(screen.getByTestId('where')).toHaveTextContent('/payslips');
  });

  it('marks everything read', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    await userEvent.click(await screen.findByText('Mark all read'));
    await waitFor(() => expect(api.apiSend).toHaveBeenCalledWith('PATCH', '/user/notifications/read-all'));
  });

  it('shows an empty state', async () => {
    vi.spyOn(api, 'apiJson').mockResolvedValue({ unread: 0, items: [] });
    setup();
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
  });
});
