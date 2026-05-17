import type { LinkRPCSchemaField } from "./schema.js";
import { LinkRPCMethodListSymbol, LinkRPCMethodSymbol } from "./symbol.js";

import { LinkRPCServiceSymbol } from "./symbol.js";

type LinkRPCAPIDefineType = Record<string,Record<string,any>>
type LinkRPCMethodConfig = {
    // timeout for this method
    timeout?:number | undefined;//ms
    schema?:{
        args?:LinkRPCSchemaField<any> | undefined,
        return?:LinkRPCSchemaField<any> | undefined
    }
}


type LinkRPCServiceConfig<T extends LinkRPCAPIDefineType,S extends keyof T> = {
    methods?:{
        [M in keyof T[S]]?:LinkRPCMethodConfig | undefined;
    } | undefined
    // default timeout for all methods in this service
    timeout?:number | undefined;//ms
}

type LinkRPCDefineConfig<T extends LinkRPCAPIDefineType> = {
    services?:{
        [S in keyof T]?:LinkRPCServiceConfig<T,S> | undefined;
    } | undefined,
    // default timeout for all services
    timeout?:number | undefined;
}

class LinkRPCAPIDefine<T extends LinkRPCAPIDefineType> {

    private config:LinkRPCDefineConfig<T>;

    private DEFAULT_METHOD_CONFIG:Readonly<LinkRPCMethodConfig> = {

    }

    constructor(config?:LinkRPCDefineConfig<T>){
        this.config = config || {};
    }

    static method(){
        return  function(target:any, propertyKey:string, descriptor:PropertyDescriptor){
            descriptor.value[LinkRPCMethodSymbol] = true;
            if(!target[LinkRPCServiceSymbol]){
                target[LinkRPCServiceSymbol] = true;
            }
            if(!target[LinkRPCMethodListSymbol]){
                target[LinkRPCMethodListSymbol] = new Set<string>();
            }
            target[LinkRPCMethodListSymbol].add(propertyKey);
        }
    }

    static isService(target:any){
        return target[LinkRPCServiceSymbol] === true;
    }

    static isMethod(method:any){
        // 判断是否是方法
        if(typeof method !== 'function'){
            return false;
        }
        if(method[LinkRPCMethodSymbol] != true){
            return false;
        }
        return true;
    }

    static getMethodList(service:any):string[]{
        if(!LinkRPCAPIDefine.isService(service)){
            return [];
        }
        return Array.from(service[LinkRPCMethodListSymbol]);
    }

    public setMethodConfig<S extends keyof T,M extends keyof T[S]>(service:S,method:M,config:LinkRPCMethodConfig){
        if(!this.config.services){
            this.config.services = {};
        }
        if(!this.config.services[service]){
            this.config.services[service] = {}
        }
        if(!this.config.services[service]!.methods){
            this.config.services[service]!.methods = {}
        }
        if(!this.config.services[service]!.methods![method]){
            this.config.services[service]!.methods![method] = {}
        }
        this.config.services[service]!.methods![method]! = config;
    }

    /**
     * if you need to get raw method config without resolve it.
     */
    public getMethodConfig<S extends keyof T,M extends keyof T[S]>(service:S,method:M):LinkRPCMethodConfig|undefined{
        const config = this.config.services?.[service]?.methods?.[method];
        if(!config){
            return;
        }
        return {
            ...config
        }
    }

    public resolveMethodConfig<S extends keyof T,M extends keyof T[S]>(service:S,method:M):LinkRPCMethodConfig|undefined{
        const serviceConfig = this.config.services?.[service];
        const methodConfig = serviceConfig?.methods?.[method] || this.DEFAULT_METHOD_CONFIG;

        // type check with required
        const config:Required<LinkRPCMethodConfig> = {
            timeout: methodConfig?.timeout || serviceConfig?.timeout || this.config.timeout,
            schema:methodConfig.schema || {}
        }
        
        return config;
    }

    public setSchemaAll(schema:{
        [S in keyof T & string]:{
            [M in keyof T[S] & string]:{
                args?:LinkRPCSchemaField<Parameters<T[S][M]>> | undefined,
                return?:LinkRPCSchemaField<ReturnType<T[S][M]>> | undefined,
            }
        }
    }){
        for(const serviceName in schema){
            const service = schema[serviceName];
            for(const methodName in service){
                const schema = service[methodName];
                // const config = (this.getMethodConfig(serviceName,methodName) || this.DEFAULT_METHOD_CONFIG)
                const config = {
                    ...this.DEFAULT_METHOD_CONFIG,
                    ...this.getMethodConfig(serviceName,methodName)
                }
                if(!config.schema){
                    config.schema = {}
                }
                config.schema.args = schema?.args;
                config.schema.return = schema?.return;
                this.setMethodConfig(serviceName,methodName,config);
            }
        }
    }
}


export {
    type LinkRPCAPIDefineType,
    type LinkRPCDefineConfig,
    type LinkRPCServiceConfig,
    type LinkRPCMethodConfig,
    LinkRPCAPIDefine,
}