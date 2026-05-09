
type F<T> = (v:T) => any

class CF<T>{
    constructor(public f:F<T>){

    }
}

const cf = new CF((v) => {

});

const a = cf.f('hello')
