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
  list: Array<T>;
  page: number;
  page_size: number;
  page_count: number;
  total: number;
};

type UnwrapResp<T> = T extends RespType<infer U> ? U : T;

enum RESP_CODE {
  SUCCESS = 0,
}

// ─── Setup header state ─────────────────────────────────────────────────────

interface SetupTokens {
  bootstrapToken: string;
  initToken: string;
}

let setupTokens: SetupTokens = { bootstrapToken: '', initToken: '' };

export function setSetupTokens(tokens: Partial<SetupTokens>) {
  setupTokens = { ...setupTokens, ...tokens };
}

export function getSetupTokens(): SetupTokens {
  return setupTokens;
}

/** URLs that should carry setup headers instead of auth headers. */
const SETUP_HEADER_URLS = ['/setup/'];

// ─── Custom Axios config interfaces ────────────────────────────────────────

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

const handleUnauthorized = () => {
  if (unauthorizedHandler) {
    unauthorizedHandler();
  }
  redirectToLoginWithNotice('sessionExpired');
};

/**
 * 创建默认 Axios 实例
 * @param options 拦截器 Handler 配置
 */
const createAxiosInstance = (options?: AxiosCreateConfigCustom) => {
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

  // 默认成功 Handler：http 200 且 code 为 0
  const defaultSuccessHandler = (response: AxiosResponse<RespType>) => {
    return response.status === 200 && response.data?.code === RESP_CODE.SUCCESS;
  };

  // 默认错误消息 Handler
  const defaultErrorMessageHandler = (response: AxiosResponse<RespType>) => getResponseErrorMessage(response);

  const successHandler = originalSuccessHandler || defaultSuccessHandler;
  const errorMessageHandler = originalErrorMessageHandler || defaultErrorMessageHandler;

  // 默认请求拦截器，不做任何处理
  const defaultRequestInterceptor: RequestInterceptor = (configs) => {
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

  // 默认响应拦截器：根据 successHandler 判断成功/失败
  const defaultResponseInterceptor: ResponseInterceptor<RespType> = (response) => {
    const { config, request } = response;
    if (successHandler(response)) {
      return Promise.resolve(response);
    }
    const msg = errorMessageHandler(response);
    const error = new AxiosError(msg, undefined, config, request, response);
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

  const requestHandler = async <T = any>(
    configs: AxiosRequestConfigCustom,
  ): Promise<UnwrapResp<T>> => {
    try {
      const result = await axiosInstance(configs);
      return result as any;
    } catch (err) {
      const error = err as AxiosError<RespType>;
      return Promise.reject(error);
    }
  };

  return requestHandler;
};

/**
 * 配置自定义 成功/错误状态 Handler，拦截器 Handler
 */
const defaultRequest = createAxiosInstance({
  requestInterceptorHandler: () => {
    const authAndSetupInterceptor: RequestInterceptor = async (configs) => {
      const isSetupRequest = SETUP_HEADER_URLS.some((url) => configs.url?.startsWith(url));

      if (isSetupRequest) {
        const tokens = getSetupTokens();
        if (tokens.bootstrapToken) {
          configs.headers['X-Setup-Bootstrap-Token'] = tokens.bootstrapToken;
        }
        if (tokens.initToken) {
          configs.headers['X-Setup-Init-Token'] = tokens.initToken;
        }
        return configs;
      }

      if (configs.ignoreAuth) {
        return configs;
      }

      const token = getAuthToken();
      if (!isEmpty(token)) {
        configs.headers.Authorization = `Bearer ${token}`;
      }
      return configs;
    };
    return [authAndSetupInterceptor];
  },
  responseInterceptorHandler: (defaultInterceptor) => {
    // 从 RespType 中提取 data 字段
    const unwrapInterceptor: ResponseInterceptor = (response) => {
      return response.data?.data;
    };
    return [defaultInterceptor, unwrapInterceptor];
  },
  responseInterceptorErrorHandler: (error) => {
    const status = error.response?.status;
    const isSetupRequest = error.config?.url?.includes('/setup/');
    const t = getTranslations();

    if (status === 401) {
      if (!isSetupRequest) {
        handleUnauthorized();
      }
    } else if (status === 403) {
      if (!isSetupRequest) {
        message.error(error.response?.data?.msg || t.common.errors.forbidden);
      }
    } else if (status && status >= 500) {
      if (!isSetupRequest) {
        message.error(error.response?.data?.msg || t.common.errors.serverError);
      }
    } else if (error.response) {
      if (!isSetupRequest) {
        message.error(getResponseErrorMessage(error.response));
      }
    } else if (error.request) {
      message.error(t.common.errors.networkError);
    } else {
      message.error(error.message || t.common.errors.requestFailed);
    }

    return Promise.reject(error);
  },
});

export default defaultRequest;