import { axiosInstance } from "./axios";
import type { LoginPayload, RegisterPayload, ApiResponse, User } from "@/types";

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export const login = async (payload: LoginPayload) => {
  const { data } = await axiosInstance.post<ApiResponse<LoginResponse>>(
    "/auth/login",
    payload
  );

  return data.data;
};

export const register = async (payload: RegisterPayload) => {
  const { data } = await axiosInstance.post("/auth/register", payload);

  return data.data;
};

export const forgotPassword = async (email: string) => {
  const { data } = await axiosInstance.post<ApiResponse<Record<string, never>>>(
    "/auth/forgot-password",
    { email }
  );

  return data;
};

export const resetPassword = async (token: string, password: string) => {
  const { data } = await axiosInstance.post<ApiResponse<Record<string, never>>>(
    "/auth/reset-password",
    { token, password }
  );

  return data;
};