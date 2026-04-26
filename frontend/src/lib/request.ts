import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { message } from 'antd';
import { getTranslations } from '@/i18n/index';
import { getAuthToken, redirectToLoginWithNotice } from './auth';
import { isEmpty } from 'radashi';

const baseURL = import.meta.env.VITE_API_URL || '/panel/api/v1';

export type RespType<T = any> = {
  code: number;
  data: T;
  msg: string;
  error?: string;
};

export type RespPage<T = any> = {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  records: Array<T>;
};

enum RESP_CODE {
  SUCCESS = 0,
}

interface AxiosRequestConfigCustom extends AxiosRequestConfig {
  ignoreAuth?: boolean;
  blobFileName?: string;
}

interface InternalAxiosRequestConfigCustom extends InternalAxiosRequestConfig {
  ignoreAuth?: boolean;
  blobFileName?: string;
}

interface AxiosResponseCustom<T> extends AxiosResponse<T> {
  config: InternalAxiosRequestConfigCustom;
}

type RequestInterceptor = (
  configs: InternalAxiosRequestConfigCustom,
) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;

type ResponseInterceptor<T = any> = (
  response: AxiosResponseCustom<T>,
) => AxiosResponseCustom<T> | Promise<AxiosResponseCustom<T>>;

interface AxiosCreateConfigCustom extends AxiosRequestConfig {
  successHandler?: (response: AxiosResponse<RespType>) => boolean;
  errorMessageHandler?: (response: AxiosResponse<RespType>) => string;
  requestInterceptorHandler?: (
    defaultRequestInterceptor: RequestInterceptor,
  ) => RequestInterceptor[];
  requestInterceptorErrorHandler?: (error: AxiosError) => Promise<any>;
  responseInterceptorHandler?: (
    defaultResponseInterceptor: ResponseInterceptor<RespType>,
  ) => ResponseInterceptor[];
  responseInterceptorErrorHandler?: (error: AxiosError<RespType>) => Promise<any>;
}

let axiosInstance: AxiosInstance;
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

function getResponseErrorMessage(response?: AxiosResponse<RespType>) {
  const t = getTranslations();

  if (!response) {
    return t.common.errors.requestFailed;
  }

  return response.data?.msg || t.common.errors.requestFailed;
}

function showHttpErrorMessage(error: AxiosError<RespType>, isSetupRequest: boolean) {
  if (isSetupRequest) {
    return;
  }

  const t = getTranslations();
  const status = error.response?.status;

  if (status === 401) {
    handleUnauthorized();
    return;
  }

  if (status === 403) {
    message.error(error.response?.data?.msg || t.common.errors.forbidden);
    return;
  }

  if (status && status >= 500) {
    message.error(error.response?.data?.msg || t.common.errors.serverError);
    return;
  }

  if (error.response) {
    message.error(getResponseErrorMessage(error.response));
    return;
  }

  if (error.request) {
    message.error(t.common.errors.networkError);
    return;
  }

  message.error(error.message || t.common.errors.requestFailed);
}

const handleUnauthorized = () => {
  if (unauthorizedHandler) {
    unauthorizedHandler();
  }
  redirectToLoginWithNotice('sessionExpired');
};

const createAxiosInstance = (options?: AxiosCreateConfigCustom): AxiosInstance => {
  const defaultConfig = {
    baseURL,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  };

  const {
    successHandler: originalSuccessHandler,
    errorMessageHandler: originalErrorMessageHandler,
    requestInterceptorHandler,
    requestInterceptorErrorHandler: originalRequestInterceptorErrorHandler,
    responseInterceptorHandler,
    responseInterceptorErrorHandler: originalResponseInterceptorErrorHandler,
    ...restOptions
  } = options || {};

  axiosInstance = axios.create({ ...defaultConfig, ...restOptions });

  const defaultSuccessHandler = (response: AxiosResponse<RespType>) => {
    return response.status === 200 && response.data?.code === RESP_CODE.SUCCESS;
  };

  const defaultErrorMessageHandler = (response: AxiosResponse<RespType>) => getResponseErrorMessage(response);

  const successHandler = originalSuccessHandler || defaultSuccessHandler;
  const errorMessageHandler = originalErrorMessageHandler || defaultErrorMessageHandler;

  const defaultRequestInterceptor: RequestInterceptor = (configs) => {
    if (configs.ignoreAuth) {
      return configs;
    }

    const token = getAuthToken();
    if (!isEmpty(token)) {
      configs.headers.Authorization = `Bearer ${token}`;
    }
    return configs;
  };

  const defaultRequestInterceptorErrorHandler = (error: AxiosError) => {
    return Promise.reject(error);
  };

  const defaultResponseInterceptorErrorHandler = (error: AxiosError) => {
    return Promise.reject(error);
  };

  const requestInterceptorErrorHandler = originalRequestInterceptorErrorHandler || defaultRequestInterceptorErrorHandler;
  const responseInterceptorErrorHandler = originalResponseInterceptorErrorHandler || defaultResponseInterceptorErrorHandler;

  if (requestInterceptorHandler) {
    const requestInterceptors = requestInterceptorHandler(defaultRequestInterceptor);
    requestInterceptors.forEach((interceptor) => {
      axiosInstance.interceptors.request.use(interceptor, requestInterceptorErrorHandler);
    });
  } else {
    axiosInstance.interceptors.request.use(defaultRequestInterceptor, requestInterceptorErrorHandler);
  }

  const defaultResponseInterceptor: ResponseInterceptor<RespType> = (response) => {
    if (successHandler(response)) {
      return Promise.resolve(response);
    }

    const isSetupRequest = response.config?.url?.includes('/setup/');
    const messageText = errorMessageHandler(response);

    if (!isSetupRequest) {
      message.error(messageText);
    }

    const error = new AxiosError(messageText, undefined, response.config, response.request, response);
    return Promise.reject(error);
  };

  if (responseInterceptorHandler) {
    const responseInterceptors = responseInterceptorHandler(defaultResponseInterceptor);
    responseInterceptors.forEach((interceptor) => {
      axiosInstance.interceptors.response.use(interceptor, responseInterceptorErrorHandler);
    });
  } else {
    axiosInstance.interceptors.response.use(defaultResponseInterceptor, responseInterceptorErrorHandler);
  }

  axiosInstance.interceptors.response.use(
    (response) => response.data?.data,
    (error: AxiosError<RespType>) => {
      const isSetupRequest = error.config?.url?.includes('/setup/');

      showHttpErrorMessage(error, Boolean(isSetupRequest));

      return Promise.reject(error);
    },
  );

  return axiosInstance;
};

const request = createAxiosInstance();

export default request;
