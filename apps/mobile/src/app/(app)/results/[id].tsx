// Detail of one round (from History, or from staff activity).

import { useLocalSearchParams } from 'expo-router';
import type { SessionDTO } from '@nboard/shared';
import { Screen } from '../../../ui/Screen';
import { Header } from '../../../ui/Header';
import { Txt } from '../../../ui/Txt';
import { ResultView } from '../../../ui/ResultView';
import { ErrorBlock, LoadingBlock } from '../../../ui/States';
import { useGet } from '../../../lib/queries';
import { fmtDateTime } from '../../../lib/format';
import { RequirePermission } from '../../../ui/RequirePermission';

export default function ResultDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useGet<SessionDTO>(id ? `/sessions/${id}` : null);
  const s = q.data;
  return (
    <RequirePermission any={['VIEW_OWN_RESULTS', 'VIEW_RESULTS']}>
      <Screen testID="screen-result-detail">
        <Header title={s?.player_name ?? 'Round'} subtitle={s ? fmtDateTime(s.ended_at ?? s.started_at) : undefined} back />
        {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : s ? (
          <>
            {s.player_code ? <Txt v="small">{s.player_code.toUpperCase()}</Txt> : null}
            <ResultView session={s} is_pb={s.is_pb} />
          </>
        ) : null}
      </Screen>
    </RequirePermission>
  );
}
