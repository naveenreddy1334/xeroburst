// Admins: the older tier that reaches every hub. Not part of the Super Admin > Hub Admin / Branch Admin > Coach chart, so no menu entry.
import { StaffAccounts } from '../../staff/staff-accounts';

export default function Admins() {
  return <StaffAccounts role="ADMIN" title="Admins" noun="admin" permission="MANAGE_ADMINS" backPath="/admins" />;
}
