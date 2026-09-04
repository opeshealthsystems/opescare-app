import type { AxiosRequestConfig } from 'axios';
import { apiClient } from './client';
import { setCacheScope } from '../lib/offlineCache';

export type PatientAccount = {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string | null;
  gender: string | null;
  country: string | null;
  is_linked: boolean;
  patient_id: string | null;
  created_at: string;
};

type Envelope<T> = { data: T };

type AuthPayload = {
  account: PatientAccount;
  token: string;
  expires_at: string;
};

export type RegisterInput = {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  password_confirmation: string;
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other';
  country?: string;
};

/**
 * Every function here that learns WHO is signed in binds the offline cache to
 * that account before returning.
 *
 * Doing it in the API layer rather than in AuthContext is deliberate: this is
 * the layer the server actually answers, so there is no path on which an
 * identity is established and the cache scope is not. A shared ward phone that
 * changes hands without anyone signing out still cannot serve the previous
 * patient's record — `setCacheScope` wipes on any change of account.
 */
export async function register(input: RegisterInput, deviceName: string): Promise<AuthPayload> {
  const res = await apiClient.post<Envelope<AuthPayload>>('/patient/register', {
    ...input,
    device_name: deviceName,
  });
  await setCacheScope(`patient:${res.data.data.account.id}`);
  return res.data.data;
}

export async function login(email: string, password: string, deviceName: string): Promise<AuthPayload> {
  const res = await apiClient.post<Envelope<AuthPayload>>('/patient/auth/token', {
    email,
    password,
    device_name: deviceName,
  });
  await setCacheScope(`patient:${res.data.data.account.id}`);
  return res.data.data;
}

export async function me(config?: AxiosRequestConfig): Promise<PatientAccount> {
  const res = await apiClient.get<Envelope<PatientAccount>>('/patient/me', config);
  await setCacheScope(`patient:${res.data.data.id}`);
  return res.data.data;
}

export async function logout(): Promise<void> {
  await apiClient.delete('/patient/auth/token');
}

export async function linkPatientRecord(medicalId: string, fullName: string): Promise<PatientAccount> {
  const res = await apiClient.post<Envelope<PatientAccount>>('/patient/link', {
    medical_id: medicalId,
    full_name: fullName,
  });
  return res.data.data;
}
