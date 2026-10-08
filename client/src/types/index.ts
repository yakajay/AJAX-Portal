export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  department?: string;
  permissions?: string[];
}
