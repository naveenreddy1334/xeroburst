// S20 Coaches.
import { StaffAccounts } from '../../staff/staff-accounts';

export default function Coaches() {
  return <StaffAccounts role="COACH" title="Coaches" noun="coach" permission="MANAGE_COACHES" backPath="/coaches" />;
}
