export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  designation?: string;
  dateOfBirth?: string | null;
  joinDate?: string | null;
  managerId?: string | null;
  /** Comma separated permission tokens, e.g. "read,write,payroll:delete" */
  permissions?: string;
  totpEnabled?: boolean;
  preferences?: { language: string; emailNotifications: boolean; emailDigest: boolean };
}

export interface PersonRef {
  id: string;
  name: string;
  email?: string;
  department?: string;
}
