import { describe, expect, it } from 'vitest';
import { guideParams, parseGuide } from './guide';

describe('City Guide URL filters', () => {
  it('round-trip every filter through the URL', () => {
    const url = 'tab=hotels&in=Old+City&sort=rating&trip=t1&day=1&rating=4.5&reviews=500&price=1%2C2&areas=Old+City%7CSardarpura&open=day2%4013%3A00&veg=1&wc=1&q=haveli';
    const s = parseGuide(new URLSearchParams(url));
    expect(s).toMatchObject({ tab: 'hotels', inArea: 'Old City', sort: 'rating', trip: 't1', day: 1, filters: { minRating: 4.5, minReviews: 500, price: [1, 2], areas: ['Old City', 'Sardarpura'], openDay: 2, openTime: '13:00', veg: true, wheelchair: true, q: 'haveli' } });
    expect(guideParams(s).toString()).toBe(url);
  });
  it('defaults and ignores junk', () => {
    const s = parseGuide(new URLSearchParams('tab=casinos&sort=random&price=9,x'));
    expect(s.tab).toBe('famous');
    expect(s.sort).toBe('famous');
    expect(s.filters.price).toEqual([]);
    expect(guideParams(s).toString()).toBe('');
  });
});
