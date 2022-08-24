# meteor-restful
meteor restful api wrapper for methods

## almost like express for get/put/delete/post methods.

## spec1: server

### res.link -> add a url current request can continue do
> Example , if a user add a doc, you need add a link to query its info 
> If allow him delete this doc, add a delete link
> rel is a function name, dif request to same route may get different url for same action - based on role or sequence version and so on

## spec2: client
### api.useLink -
> get link base on rel name or "default" -
> run it with payload

## spec3：client
### api.sequence -  run a serial request, first path is a real url - after it should be the rel name 
> example -> api.sequence('/users','create','phonecode')
>  will request '/users' then use the create rel then phonecode,
>> why?  when request '/users' if, this request has no auth or some case , no create ref return, blocked it and hide the real url - dynamic or some thing, or even link to anothor server
