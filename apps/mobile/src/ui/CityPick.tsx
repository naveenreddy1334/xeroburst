// City dropdown for hubs: a list of common cities, with "Other city" for anything not on it (then a text box appears).

import { useState } from 'react';
import { View } from 'react-native';
import { C } from '../theme/tokens';
import { useDevice } from '../theme/device';
import { Field } from './Field';
import { Select } from './Select';
import { X } from './Bits';

export const CITIES = [
  'Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi', 'Belagavi',
  'Hyderabad', 'Chennai', 'Coimbatore', 'Kochi', 'Thiruvananthapuram',
  'Mumbai', 'Pune', 'Ahmedabad', 'Surat', 'Nagpur',
  'Delhi', 'Gurugram', 'Noida', 'Chandigarh', 'Jaipur', 'Lucknow',
  'Kolkata', 'Bhubaneswar', 'Visakhapatnam', 'Vijayawada', 'Indore', 'Bhopal',
  'Dubai', 'Abu Dhabi', 'Sharjah',
];
const OTHER = '__other';

export function CityPick({ value, onChange }: { value: string; onChange: (city: string) => void }) {
  const { u } = useDevice();
  // A saved city that is not on the list opens as "Other city" with its name filled in.
  const [other, setOther] = useState(!!value && !CITIES.includes(value));
  const options = [{ value: '', label: 'No city' }, ...CITIES.map((c) => ({ value: c, label: c })), { value: OTHER, label: 'Other city…' }];
  const shown = other ? OTHER : value;
  return (
    <View style={{ marginBottom: u * 0.75, gap: u * 0.375 }}>
      <X s={0.8} w="m" c={C.sub}>City</X>
      <Select
        label="City"
        value={shown}
        options={options}
        onChange={(v) => {
          if (v === OTHER) { setOther(true); if (CITIES.includes(value)) onChange(''); return; }
          setOther(false);
          onChange(v);
        }}
      />
      {other ? <Field label="City name" value={value} onChangeText={onChange} placeholder="Type the city" autoCapitalize="words" maxLength={60} /> : null}
    </View>
  );
}