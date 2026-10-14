// S21 Admins.
import { StaffAccounts } from '../../staff/staff-accounts';

export default function Admins() {
  return <StaffAccounts role="ADMIN" title="Admins" noun="admin" permission="MANAGE_ADMINS" backPath="/admins" />;
}
