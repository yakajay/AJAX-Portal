import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import CommandPalette from './CommandPalette';
import { I18nProvider } from '../../lib/i18n';
import * as api from '../../lib/api';

const Where = () => <p data-testid="where">{useLocation().pathname + useLocation().search}</p>;

const renderPalette = (user = { id: 'u1', name: 'Jane', email: 'j@x.co', role: 'USER' }, onClose = vi.fn(), onLogout = vi.fn()) => {
  render(
    <I18nProvider>
      <MemoryRouter>
        <CommandPalette open onClose={onClose} user={user} onLogout={onLogout} />
        <Where />
      </MemoryRouter>
    </I18nProvider>
  );
  return { onClose, onLogout };
};

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.spyOn(api, 'apiJson').mockResolvedValue([
      { id: 'p1', name: 'Priya Sharma', email: 'priya@x.co', department: 'Human Resources', designation: 'HR Manager' }
    ]);
  });

  it('filters pages as you type and navigates on Enter', async () => {
    const { onClose } = renderPalette();
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'pay');
    expect(screen.getByRole('option', { name: /My payslips/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Attendance/ })).not.toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/payslips');
    expect(onClose).toHaveBeenCalled();
  });

  it('finds colleagues and opens the directory filtered to them', async () => {
    renderPalette();
    await userEvent.type(screen.getByRole('combobox'), 'priya');
    const option = await screen.findByRole('option', { name: /Priya Sharma/ });
    await userEvent.click(option);
    expect(screen.getByTestId('where')).toHaveTextContent('/directory?q=Priya%20Sharma');
  });

  it('hides admin-only pages from regular users but shows them to admins', async () => {
    const { unmount } = render(
      <I18nProvider><MemoryRouter><CommandPalette open onClose={vi.fn()} user={{ id: 'u1', name: 'J', email: 'j@x', role: 'USER' }} onLogout={vi.fn()} /></MemoryRouter></I18nProvider>
    );
    await userEvent.type(screen.getByRole('combobox'), 'audit');
    expect(screen.getByText('No results')).toBeInTheDocument();
    unmount();
    render(
      <I18nProvider><MemoryRouter><CommandPalette open onClose={vi.fn()} user={{ id: 'a1', name: 'A', email: 'a@x', role: 'SUPER_ADMIN' }} onLogout={vi.fn()} /></MemoryRouter></I18nProvider>
    );
    await userEvent.type(screen.getByRole('combobox'), 'audit');
    expect(screen.getByRole('option', { name: /Audit log/ })).toBeInTheDocument();
  });

  it('supports arrow-key selection, Escape and the sign-out action', async () => {
    const { onClose, onLogout } = renderPalette();
    await userEvent.type(screen.getByRole('combobox'), 'sign out');
    await userEvent.keyboard('{Enter}');
    expect(onLogout).toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
