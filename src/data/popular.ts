// More destinations on Explore, beyond the eight hand-written guides. Only well-known facts and our own mood tags;
// everything else (place ID, photo, places, climate, areas) comes live from Google, Open-Meteo and OpenStreetMap
// when a card is opened. `q` is what we search Google for.
import type { DestType } from '../engine/types';

export interface PopularDest { name: string; state: string; q: string; type: DestType; moods: string[]; tag: string }

export const POPULAR: PopularDest[] = [
  { name: 'Delhi', state: 'Delhi', q: 'New Delhi, Delhi, India', type: 'metro', moods: ['city', 'food'], tag: 'Mughal monuments, bazaars and street food' },
  { name: 'Agra', state: 'Uttar Pradesh', q: 'Agra, Uttar Pradesh, India', type: 'tier2', moods: ['city', 'photo', 'romantic'], tag: 'Taj Mahal and Agra Fort' },
  { name: 'Mumbai', state: 'Maharashtra', q: 'Mumbai, Maharashtra, India', type: 'metro', moods: ['city', 'food'], tag: 'Seafront, colonial architecture and street food' },
  { name: 'Amritsar', state: 'Punjab', q: 'Amritsar, Punjab, India', type: 'tier2', moods: ['city', 'food'], tag: 'Golden Temple and Punjabi food' },
  { name: 'Jodhpur', state: 'Rajasthan', q: 'Jodhpur, Rajasthan, India', type: 'tier2', moods: ['city', 'photo'], tag: 'Mehrangarh Fort and the blue old city' },
  { name: 'Jaisalmer', state: 'Rajasthan', q: 'Jaisalmer, Rajasthan, India', type: 'tier2', moods: ['adventure', 'photo', 'romantic'], tag: 'Living sandstone fort and Thar desert dunes' },
  { name: 'Pushkar', state: 'Rajasthan', q: 'Pushkar, Rajasthan, India', type: 'pilgrimage', moods: ['slow', 'budget'], tag: 'Holy lake, ghats and cafés' },
  { name: 'Mount Abu', state: 'Rajasthan', q: 'Mount Abu, Rajasthan, India', type: 'hill', moods: ['mountain', 'slow'], tag: 'Rajasthan’s hill station and Dilwara temples' },
  { name: 'Shimla', state: 'Himachal Pradesh', q: 'Shimla, Himachal Pradesh, India', type: 'hill', moods: ['mountain', 'romantic'], tag: 'Colonial hill town on the Mall Road' },
  { name: 'Dharamshala and McLeod Ganj', state: 'Himachal Pradesh', q: 'McLeod Ganj, Dharamshala, Himachal Pradesh, India', type: 'hill', moods: ['mountain', 'slow', 'budget'], tag: 'Tibetan culture, cafés and Triund trek' },
  { name: 'Kasol', state: 'Himachal Pradesh', q: 'Kasol, Himachal Pradesh, India', type: 'hill', moods: ['mountain', 'budget', 'adventure'], tag: 'Parvati valley riverside village and treks' },
  { name: 'Bir Billing', state: 'Himachal Pradesh', q: 'Bir, Himachal Pradesh, India', type: 'hill', moods: ['adventure', 'mountain'], tag: 'Paragliding and monasteries' },
  { name: 'Spiti Valley', state: 'Himachal Pradesh', q: 'Kaza, Spiti Valley, Himachal Pradesh, India', type: 'hill', moods: ['adventure', 'mountain', 'photo'], tag: 'High-altitude cold desert and monasteries' },
  { name: 'Leh', state: 'Ladakh', q: 'Leh, Ladakh, India', type: 'hill', moods: ['adventure', 'mountain', 'photo'], tag: 'High passes, monasteries and Pangong Lake' },
  { name: 'Srinagar', state: 'Jammu and Kashmir', q: 'Srinagar, Jammu and Kashmir, India', type: 'tier2', moods: ['romantic', 'mountain', 'slow'], tag: 'Dal Lake houseboats and Mughal gardens' },
  { name: 'Mussoorie', state: 'Uttarakhand', q: 'Mussoorie, Uttarakhand, India', type: 'hill', moods: ['mountain', 'romantic'], tag: 'Hill town above Dehradun' },
  { name: 'Nainital', state: 'Uttarakhand', q: 'Nainital, Uttarakhand, India', type: 'hill', moods: ['mountain', 'slow'], tag: 'Lake town in the Kumaon hills' },
  { name: 'Darjeeling', state: 'West Bengal', q: 'Darjeeling, West Bengal, India', type: 'hill', moods: ['mountain', 'slow', 'photo'], tag: 'Tea gardens, toy train and Kanchenjunga views' },
  { name: 'Gangtok', state: 'Sikkim', q: 'Gangtok, Sikkim, India', type: 'hill', moods: ['mountain', 'adventure'], tag: 'Sikkim’s capital and gateway to Tsomgo Lake' },
  { name: 'Shillong', state: 'Meghalaya', q: 'Shillong, Meghalaya, India', type: 'hill', moods: ['mountain', 'slow', 'photo'], tag: 'Hills, waterfalls and living root bridges nearby' },
  { name: 'Hampi', state: 'Karnataka', q: 'Hampi, Karnataka, India', type: 'other', moods: ['photo', 'budget', 'adventure'], tag: 'Boulder landscape and Vijayanagara ruins' },
  { name: 'Gokarna', state: 'Karnataka', q: 'Gokarna, Karnataka, India', type: 'beach', moods: ['beach', 'budget', 'slow'], tag: 'Temple town and quiet beaches' },
  { name: 'Coorg', state: 'Karnataka', q: 'Madikeri, Kodagu, Karnataka, India', type: 'hill', moods: ['mountain', 'slow', 'romantic'], tag: 'Coffee estates and misty hills' },
  { name: 'Mysuru', state: 'Karnataka', q: 'Mysuru, Karnataka, India', type: 'tier2', moods: ['city', 'photo'], tag: 'Mysore Palace and markets' },
  { name: 'Ooty', state: 'Tamil Nadu', q: 'Ooty, Tamil Nadu, India', type: 'hill', moods: ['mountain', 'romantic'], tag: 'Nilgiri hill station and mountain railway' },
  { name: 'Kodaikanal', state: 'Tamil Nadu', q: 'Kodaikanal, Tamil Nadu, India', type: 'hill', moods: ['mountain', 'slow', 'romantic'], tag: 'Lake, forests and viewpoints' },
  { name: 'Munnar', state: 'Kerala', q: 'Munnar, Kerala, India', type: 'hill', moods: ['mountain', 'slow', 'photo'], tag: 'Tea estates in the Western Ghats' },
  { name: 'Varkala', state: 'Kerala', q: 'Varkala, Kerala, India', type: 'beach', moods: ['beach', 'slow', 'budget'], tag: 'Cliff-top beach town' },
  { name: 'Andaman Islands', state: 'Andaman and Nicobar Islands', q: 'Swaraj Dweep (Havelock Island), Andaman and Nicobar Islands, India', type: 'beach', moods: ['beach', 'adventure', 'romantic'], tag: 'White-sand beaches, snorkelling and diving' },
  { name: 'Khajuraho', state: 'Madhya Pradesh', q: 'Khajuraho, Madhya Pradesh, India', type: 'tier2', moods: ['photo', 'city'], tag: 'UNESCO-listed temple groups' },
  { name: 'Auli', state: 'Uttarakhand', q: 'Auli, Uttarakhand, India', type: 'hill', moods: ['mountain', 'adventure'], tag: 'Ski slopes and Himalayan views' },
  { name: 'Wayanad', state: 'Kerala', q: 'Kalpetta, Wayanad, Kerala, India', type: 'wildlife', moods: ['slow', 'adventure'], tag: 'Forests, waterfalls and wildlife sanctuaries' },
];
