export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  /** Platform staff only: what the person may do in the client portal (older accounts have none and count as 'super') */
  platformRole?: 'viewer' | 'admin' | 'super';
  department?: string;
  designation?: string;
  employeeId?: string | null;
  phone?: string;
  dateOfBirth?: string | null;
  joinDate?: string | null;
  managerId?: string | null;
  /** Comma separated permission tokens, e.g. "read,write,payroll:delete" */
  permissions?: string;
  totpEnabled?: boolean;
  /** Upload time of the profile photo (ms), or null when there is none */
  avatarVersion?: number | null;
  preferences?: { language: string; emailNotifications: boolean; emailDigest: boolean };
}

export interface PersonRef {
  id: string;
  name: string;
  email?: string;
  department?: string;
}
