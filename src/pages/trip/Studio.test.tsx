import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { makeQueryClient } from '../../lib/query';
import { beforeEach, describe, expect, it } from 'vitest';
import { Toast } from '../../components/Toast';
import { buildSampleTrip } from '../../engine/generate';
import { useTrips } from '../../store/trips';
import { useUI } from '../../store/ui';
import TripPage from './TripPage';

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/trips/:id/:tab" element={<TripPage />} /></Routes>
        <Toast />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useTrips.setState({ trips: {}, undo: {} });
  useTrips.getState().add(buildSampleTrip(new Date('2026-11-20T10:00:00')));
  useUI.setState({ cur: null, day: 0, ptab: 'checks', slot: null });
});

describe('Itinerary Studio', () => {
  it('shows Day 3 alerts, applies the overload fix, and undoes it', async () => {
    renderAt('/trips/sample-jaipur/itinerary');
    fireEvent.click(await screen.findByRole('button', { name: /^Day 3/ }));
    expect(screen.getByText('Day 3 looks overloaded')).toBeInTheDocument();
    expect(screen.getByText('Tight transfer to Chokhi Dhani')).toBeInTheDocument();

    const card = screen.getByText('Day 3 looks overloaded').closest('.warn') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Move \d to lighter days/ }));
    expect(screen.queryByText('Day 3 looks overloaded')).not.toBeInTheDocument();
    const toastEl = document.querySelector('.toast') as HTMLElement;
    expect(toastEl).toHaveTextContent(/Moved .* → Day/);
    expect(useTrips.getState().trips['sample-jaipur'].touched).toBe(true);

    act(() => { fireEvent.click(within(toastEl).getByRole('button', { name: 'Undo' })); });
    expect(screen.getByText('Day 3 looks overloaded')).toBeInTheDocument();
  });

  it('reorders with the ↓ button (keyboard path)', async () => {
    renderAt('/trips/sample-jaipur/itinerary');
    fireEvent.click(await screen.findByRole('button', { name: /^Day 2/ }));
    const titles = () => [...document.querySelectorAll('.tl .bt')].map((e) => e.textContent);
    const [a, b] = titles();
    fireEvent.click(screen.getByRole('button', { name: `Move ${a} down` }));
    expect(titles().slice(0, 2)).toEqual([b, a]);
  });

  it('opens the library from an empty-day fix and adds a place at a free slot', async () => {
    renderAt('/trips/sample-jaipur/itinerary');
    await screen.findByRole('button', { name: /^Day 1/ });
    fireEvent.click(screen.getByRole('tab', { name: 'Places' }));
    fireEvent.change(screen.getByLabelText('Search places'), { target: { value: 'Galtaji' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Galtaji (Monkey Temple)' }));
    expect([...document.querySelectorAll('.tl .bt')].map((e) => e.textContent)).toContain('Galtaji (Monkey Temple)');
  });
});
