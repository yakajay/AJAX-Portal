import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Avatar, initialsOf } from './Avatar';
import * as api from '../lib/api';

describe('Avatar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:photo');
  });

  it('builds initials from the name', () => {
    expect(initialsOf('Asha Rao')).toBe('AR');
    expect(initialsOf('  madonna ')).toBe('M');
    expect(initialsOf('')).toBe('?');
  });

  it('shows initials and never fetches when the person has no photo', () => {
    const spy = vi.spyOn(api, 'apiFetch');
    render(<Avatar person={{ id: 'u1', name: 'Asha Rao', avatarVersion: null }} />);
    expect(screen.getByText('AR')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('swaps in the photo once it loads, fetching each person/version only once', async () => {
    const spy = vi.spyOn(api, 'apiFetch').mockResolvedValue({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) } as Response);
    const person = { id: 'u2', name: 'Ben Hire', avatarVersion: 111 };
    const { container } = render(<><Avatar person={person} /><Avatar person={person} /></>);
    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(2));
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:photo');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('/user/avatars/u2?v=111');
  });

  it('keeps the initials when the photo cannot be fetched', async () => {
    vi.spyOn(api, 'apiFetch').mockResolvedValue({ ok: false, blob: async () => new Blob([]) } as Response);
    const { container } = render(<Avatar person={{ id: 'u3', name: 'Cy Dee', avatarVersion: 5 }} />);
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalled());
    expect(screen.getByText('CD')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
