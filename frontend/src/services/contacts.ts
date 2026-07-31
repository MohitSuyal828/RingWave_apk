import { axiosInstance } from "./axios";

export interface Contact {
  id: number;
  name: string;
  email: string;
  user_created_at: string;
  added_at: string;
}

export const listContacts = async (): Promise<Contact[]> => {
  const { data } = await axiosInstance.get("/contacts");
  return data.data.contacts;
};

export const addContact = async (contactId: number) => {
  const { data } = await axiosInstance.post("/contacts", { contactId });
  return data.data.contact;
};

export const removeContact = async (contactId: number) => {
  await axiosInstance.delete(`/contacts/${contactId}`);
};
