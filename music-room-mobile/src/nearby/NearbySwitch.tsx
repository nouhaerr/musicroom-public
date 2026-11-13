import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faBell } from '@fortawesome/free-solid-svg-icons';
import { useAutoDismiss } from '../hooks/useAutoDismiss';
import type { ApiClient } from '../api/client';
import { styles } from '../components/ProfileUI';
import { nearby } from './load';

// The opt-in switch of "rooms nearby", off until the user turns it on: it uses the position in the background.
// Greyed out in Expo Go, which cannot run it.
export function NearbySwitch({ client }: { client: ApiClient }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(true); // until the saved choice is read
  const [error, setError] = useState('');
  useAutoDismiss(error, setError);

  useEffect(() => {
    if (!nearby) return;
    let active = true;
    void nearby.isNearbyOn().then(saved => { if (active) setOn(saved); }).catch(() => undefined)
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function change(value: boolean) {
    if (!nearby) return;
    setBusy(true); setError('');
    try {
      if (value) await nearby.turnNearbyOn(client);
      else await nearby.turnNearbyOff();
      setOn(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to change this setting.');
      setOn(false);
      await nearby.turnNearbyOff().catch(() => undefined); // a half-done start leaves nothing watched
    } finally { setBusy(false); }
  }

  return <View style={n.row}>
    <View style={n.icon}><FontAwesomeIcon icon={faBell} color="#AEB5FF" size={17} /></View>
    <View style={n.grow}>
      <Text style={n.title}>Nearby room alerts</Text>
      <Text style={n.subtitle}>{nearby
        ? 'Get notified when you’re near a public room. The list updates each time you open Sonora.'
        : 'Needs a Sonora development build (not available in Expo Go).'}</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
    <Switch accessibilityLabel="Nearby room alerts" value={on} disabled={!nearby || busy} onValueChange={value => void change(value)}
      trackColor={{ false: '#3B4355', true: '#AEB5FF' }} thumbColor={on ? '#F3F3E9' : '#B4BDCE'} />
  </View>;
}

const n = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#171A25' },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1E2A5C', alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, gap: 2 },
  title: { color: '#F3F3E9', fontSize: 15, fontWeight: '700' },
  subtitle: { color: '#8D97AB', fontSize: 13, lineHeight: 18 },
});
