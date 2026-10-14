import { Modal, View } from 'react-native';
import type { ReactNode } from 'react';
import { C, R } from '../theme/tokens';
import { Button } from './Button';
import { Txt } from './Txt';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm?: () => void;
  onCancel: () => void;
}

export function Dialog({ visible, title, message, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, loading, onConfirm, onCancel }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} supportedOrientations={['portrait', 'landscape']}>
      <View style={{ flex: 1, backgroundColor: C.scrim, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 480, backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1.5, borderColor: C.borderStrong, padding: 22, gap: 14 }}>
          <Txt v="h1">{title}</Txt>
          {message ? <Txt v="body" color={C.sub}>{message}</Txt> : null}
          {children}
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button label={cancelLabel} variant="secondary" onPress={onCancel} preferredFocus={!danger} />
            {onConfirm ? <Button label={confirmLabel} variant={danger ? 'danger' : 'primary'} onPress={onConfirm} loading={loading} /> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
