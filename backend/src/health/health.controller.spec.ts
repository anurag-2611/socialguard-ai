import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ok', () => {
    expect(new HealthController().check()).toEqual({
      status: 'ok',
      service: 'backend',
      version: '0.1.0',
    });
  });
});
