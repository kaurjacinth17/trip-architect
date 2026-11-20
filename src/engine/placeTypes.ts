// Google place type → our category and a default visit duration. Durations are planning defaults by type
// (editable on every block), not facts about any place.
import type { Cat } from './types';

const RULES: [RegExp, Cat, number][] = [
  [/^(lodging|hotel|resort_hotel|guest_house|hostel|motel|bed_and_breakfast|inn)$/, 'custom', 60],
  [/(_restaurant|^restaurant|^meal_takeaway|^food_court|^diner|^steak_house|^buffet)/, 'food', 75],
  [/^(cafe|coffee_shop|bakery|tea_house|dessert_shop|ice_cream_shop|juice_shop|cafeteria)$/, 'cafe', 45],
  [/^(bar|pub|night_club|wine_bar|cocktail_bar|lounge_bar|karaoke)$/, 'night', 120],
  [/^(hindu_temple|place_of_worship|church|mosque|synagogue|buddhist_temple|gurudwara|shrine)$/, 'spiritual', 45],
  [/^(museum|historical_landmark|historical_place|monument|castle|palace|fort|archaeological_site|cultural_landmark|art_gallery|memorial)$/, 'heritage', 90],
  [/^(national_park|state_park|hiking_area|wildlife_park|wildlife_refuge|nature_preserve|botanical_garden|park|garden|beach|lake|natural_feature|mountain_peak|waterfall|zoo|campground)$/, 'nature', 90],
  [/^(amusement_park|water_park|aquarium|adventure_sports_center|tour_agency|cultural_center|performing_arts_theater|movie_theater|bowling_alley|spa|ski_resort|golf_course|cooking_class)$/, 'activity', 120],
  [/^(shopping_mall|market|store|clothing_store|gift_shop|book_store|jewelry_store|department_store|supermarket|flea_market)$/, 'shop', 90],
  [/^(tourist_attraction|observation_deck|scenic_spot|viewpoint|landmark|plaza|bridge|town_square)$/, 'sight', 60],
];

const DUR_OVERRIDE: Record<string, number> = {
  national_park: 240, wildlife_park: 240, hiking_area: 180, zoo: 150, beach: 120, amusement_park: 240, water_park: 240,
  observation_deck: 45, art_gallery: 60, botanical_garden: 75, museum: 90, ski_resort: 300, fort: 120, castle: 120, palace: 90,
};

export function categorise(primaryType: string | undefined, types: string[] = []): { cat: Cat; duration: number } {
  const list = [primaryType, ...types].filter(Boolean) as string[];
  for (const t of list) {
    for (const [re, cat, d] of RULES) if (re.test(t)) return { cat, duration: DUR_OVERRIDE[t] ?? d };
  }
  return { cat: 'sight', duration: 60 };
}

export const isLodging = (types: string[] = []) => types.some((t) => /^(lodging|hotel|resort_hotel|guest_house|hostel|motel|bed_and_breakfast|inn)$/.test(t));
