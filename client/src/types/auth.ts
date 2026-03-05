export interface User {
  id: number;
  username: string;
  role: 'admin' | 'doctor' | 'nurse' | 'pharmacist';
  displayName: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
