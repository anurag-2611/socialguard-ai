import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { resetStoreForTests } from './store/store';

describe('App', () => {
  beforeEach(() => resetStoreForTests());

  it('sends a signed-out visitor to the sign-in page', () => {
    render(<MemoryRouter initialEntries={['/cases']}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText(/Demo mode accounts/)).toBeInTheDocument();
  });
});
