import { axiosInstance } from "./axios";

export const uploadOwnIdentityKey = async (publicKey: JsonWebKey) => {
  const { data } = await axiosInstance.put("/users/identity-key", {
    publicKey,
    algorithm: "ECDH-P256",
  });

  return data.data;
};

interface IdentityKeyResponse {
  publicKey: JsonWebKey;
  algorithm: string;
  updatedAt: string;
}

/** Returns null (rather than throwing) if the contact hasn't set up an
 *  identity key yet — a real, common state (e.g. they haven't opened the
 *  app since this feature shipped), not an error condition callers need
 *  their own try/catch for. */
export const fetchContactIdentityKey = async (
  userId: number
): Promise<IdentityKeyResponse | null> => {
  try {
    const { data } = await axiosInstance.get(`/users/${userId}/identity-key`);
    return data.data;
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404) return null;
    throw error;
  }
};
