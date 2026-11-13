import { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type AppDialogAction = {
  text: string;
  style?: 'cancel' | 'destructive';
  onPress?: () => void;
};
type DialogState = { title: string; message: string; actions: AppDialogAction[] };

export function useAppDialog() {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const showDialog = useCallback((title: string, message: string, actions: AppDialogAction[]) => setDialog({ title, message, actions }), []);
  const dialogElement = dialog ? <Modal transparent animationType="fade" visible onRequestClose={() => setDialog(null)}>
    <View style={s.backdrop}>
      <View accessibilityViewIsModal accessibilityRole="alert" style={s.panel}>
        <Text style={s.title}>{dialog.title}</Text>
        <Text style={s.message}>{dialog.message}</Text>
        <View style={s.actions}>{dialog.actions.map((action, index) => <Pressable
          key={`${action.text}-${index}`} accessibilityRole="button" onPress={() => {
            setDialog(null);
            action.onPress?.();
          }} style={({ pressed }) => [s.button, action.style === 'cancel' && s.cancel, action.style === 'destructive' && s.destructive, pressed && s.pressed]}>
          <Text style={[s.buttonText, action.style === 'destructive' && s.destructiveText]}>{action.text}</Text>
        </Pressable>)}</View>
      </View>
    </View>
  </Modal> : null;
  return { showDialog, dialogElement };
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(4, 5, 12, 0.78)' },
  panel: { width: '100%', maxWidth: 440, alignSelf: 'center', padding: 22, borderRadius: 22, borderWidth: 1, borderColor: '#343449', backgroundColor: '#13141c', gap: 12 },
  title: { color: '#f5f5fa', fontSize: 19, lineHeight: 25, fontWeight: '700' },
  message: { color: '#999bae', fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  button: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 13, borderWidth: 1, borderColor: '#545fff', backgroundColor: '#535fff' },
  cancel: { borderColor: '#343449', backgroundColor: '#1b1c27' },
  destructive: { borderColor: '#8a3d54', backgroundColor: '#2b1822' },
  buttonText: { color: '#f5f5fa', fontSize: 14, fontWeight: '600' },
  destructiveText: { color: '#ffadbf' },
  pressed: { opacity: 0.7 },
});
