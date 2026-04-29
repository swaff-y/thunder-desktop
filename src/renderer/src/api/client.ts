import axios from "axios";
import { API_URL } from "../config/env";

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem("userToken");
  const apiKey = localStorage.getItem("apiKey");
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers["x-api-key"] = apiKey;
  return headers;
}

const client = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

client.interceptors.request.use((config) => {
  Object.assign(config.headers, getAuthHeaders());
  return config;
});

export default client;
