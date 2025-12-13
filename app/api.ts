import axios from "axios";

export const annotationAPI = axios.create({
  baseURL:
    typeof window === "undefined"
      ? process.env?.ANNOTATION_URL
      : window.ENV?.ANNOTATION_URL,
  timeout: 0,
});

export const loaderAPI = axios.create({
  baseURL:
    typeof window === "undefined"
      ? process.env?.LOADER_URL
      : window.ENV?.LOADER_URL,
  timeout: 0,
});

export const integrationAPI = axios.create({
  baseURL:
    // @ts-ignore
    typeof window === "undefined"
      ? process.env?.INTEGRATION_URL
      : window.ENV?.INTEGRATION_URL,
  timeout: 0,
});
