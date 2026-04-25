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

enum AXIOS_ERR_E {
  ERR_SERVER = 'ERR_SERVER',
}

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

const AUTH_ERROR_CODES = new Set([401, 40011, 40012]);
const SILENT_ERROR_CODES = new Set([40004]);

let axiosInstance: AxiosInstance;
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
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

  const defaultErrorMessageHandler = (response: AxiosResponse<RespType>) => {
    const t = getTranslations();
    const detail = response.data?.msg || t.common.errors.requestFailed;
    return response.data?.error ? `${detail}\n\n${response.data.error}` : detail;
  };

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
    const code = response.data?.code;

    if (!isSetupRequest) {
      const t = getTranslations();
      if (AUTH_ERROR_CODES.has(code ?? -1)) {
        handleUnauthorized();
      } else if (code === 403) {
        message.error(t.common.errors.forbidden);
      } else if (SILENT_ERROR_CODES.has(code ?? -1)) {
        // Silently reject — let the caller handle it
      } else {
        message.error(messageText, code === 50000 ? 6 : undefined);
      }
    }

    const error = new AxiosError(messageText, AXIOS_ERR_E.ERR_SERVER, response.config, response.request, response);
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
    (error) => {
      const t = getTranslations();
      const isSetupRequest = error.config?.url?.includes('/setup/');

      if (error.response) {
        const { status } = error.response;
        if (status === 401 && !isSetupRequest) {
          handleUnauthorized();
        } else if (status === 403 && !isSetupRequest) {
          message.error(t.common.errors.forbidden);
        } else if (status >= 500 && !isSetupRequest) {
          message.error(t.common.errors.serverError);
        } else if (!isSetupRequest) {
          message.error(error.response.data?.msg || t.common.errors.requestFailed);
        }
      } else if (error.request && !isSetupRequest) {
        message.error(t.common.errors.networkError);
      }
      return Promise.reject(error);
    },
  );

  return axiosInstance;
};

const request = createAxiosInstance();

export default request;
