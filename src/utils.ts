import type { LinkRPCAPIDefine } from "./define.js";
import type { LinkRPCRequestPacket, LinkRPCResponsePacket } from "./packet.js";

export type FunctionTypeToPromiseFunctionType<T extends (...args: any[]) => any> =
  T extends (...args: infer P) => Promise<infer R> ?
  (...args: P) => Promise<R>
  : T extends (...args: infer P) => infer R ?
  (...args: P) => Promise<R>
  : never
  ;

export type LinkRPCDefineToRPCAPI<T extends LinkRPCAPIDefine<any>> = T extends LinkRPCAPIDefine<infer U> ?
  {
    [S in keyof U]: {
      [M in keyof U[S]]: {
        /** 调用该方法 */
        call: FunctionTypeToPromiseFunctionType<U[S][M]>,
        /** 获取方法id */
        request: (config: {
          args: Parameters<U[S][M]>,
          timeout?: number,
          callback?: (result: ReturnType<U[S][M]>, req: LinkRPCRequestPacket, res: LinkRPCResponsePacket) => void,
          error?: (error: any, req: LinkRPCRequestPacket, res: LinkRPCResponsePacket) => void,
        }) => string,
        id: string,
        /** 获取方法路径 */
        path: string,
      }
    }
  }
  : never;

export type LinkRPCDefineToRPCInterface<D extends LinkRPCAPIDefine<any>,T> = D extends LinkRPCAPIDefine<infer U> ?
  {
    [S in keyof U]: {
      [M in keyof U[S]]: (...args: Parameters<U[S][M]>) => Promise<ReturnType<U[S][M]>>
    }
  }
  : never;

export type LinkRPCDefineServiceName<T extends LinkRPCAPIDefine<any>> = T extends LinkRPCAPIDefine<infer U> ? keyof U & string : never;
export type LinkRPCDefineMethodName<T extends LinkRPCAPIDefine<any>, S extends LinkRPCDefineServiceName<T>> = T extends LinkRPCAPIDefine<infer U> ? keyof U[S] & string : never;
export type LinkRPCDefineMethodBody<T extends LinkRPCAPIDefine<any>, S extends LinkRPCDefineServiceName<T>, M extends LinkRPCDefineMethodName<T, S>> = T extends LinkRPCAPIDefine<infer U> ? U[S][M] : never;
export type LinkRPCDefineServiceInstance<T extends LinkRPCAPIDefine<any>, S extends LinkRPCDefineServiceName<T>> = T extends LinkRPCAPIDefine<infer U> ? U[S] : never;


export type TypedEmitterEvents = {
  [key: string]: (...args: any[]) => void
}

export class TypedEmitter<T extends TypedEmitterEvents> {

  private record: Map<keyof T, Set<T[keyof T]>> = new Map();

  on<K extends keyof T>(event: K, callback: T[K]) {
    if (!this.record.has(event)) {
      this.record.set(event, new Set());
    }
    this.record.get(event)!.add(callback);
    return () => {
      this.off(event, callback);
    }
  }

  off<K extends keyof T>(event: K, callback: T[K]) {
    if (!this.record.has(event)) {
      return;
    }
    this.record.get(event)!.delete(callback);
  }

  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>) {
    if (!this.record.has(event)) {
      return;
    }
    for (const callback of this.record.get(event)!) {
      callback(...args);
    }
  }

  once<K extends keyof T>(event: K, callback: T[K]) {
    const wrapper = (...args: Parameters<T[K]>) => {
      callback(...args);
      this.off(event, wrapper as T[K]);
    }
    this.on(event, wrapper as T[K]);
  }

  removeAllListeners() {
    this.record.clear();
  }
}

export class IdMaker {

  public static instance = new IdMaker();

  static makeId(): string {
    return IdMaker.instance.makeId();
  }

  public makeId(): string {
    // 生成12位随机字符串
    const suffix = Math.random().toString(36).substring(2, 10);
    const timestamp = Date.now().toString(36);
    return `${timestamp}${suffix}`;
  }
}

export class PromiseTimeout<T> {

  private promise: Promise<T>;
  private reject?: (reason?: any) => void;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: any) => void
    ) => void
  ) {
    this.promise = new Promise<T>((resolve, reject) => {
      this.reject = reject;
      executor(resolve, reject);
    }).finally(() => {
      if (this.timer) {
        clearTimeout(this.timer)
      }
    })
  }

  public timeout(time: number) {
    if (time <= 0) {
      clearTimeout(this.timer);
      return this;
    }
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => {
      this.reject?.(new Error(`Promise timed out after ${time}ms`));
    }, time)
    return this;
  }

  get catch() {
    return this.promise.catch.bind(this.promise);
  }

  get finally() {
    return this.promise.finally.bind(this.promise);
  }

  get then() {
    return this.promise.then.bind(this.promise);
  }
}

export function dynamicimport(name: string) {
  return import(/* @vite-ignore */`${name}` + '');
}