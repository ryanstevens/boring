import Layout from './Layout';
import decorators from '../../../decorators';
import getReactHandlerPaths from './reactHandlerPaths';
import renderRedux from './renderRedux';
import dynamicComponents from './dynamicComponents';
import {getNamespace} from 'boring-cls';
import logger from 'boring-logger';
import requireHandlerPaths from './requireHandlerPaths';
import config from 'boring-config';
import paths from 'paths';

module.exports = function reactHook(BoringInjections) {

  require('nodenopack');

  const {
    boring,
  } = BoringInjections;

  const isDevelopment = config.get('boring.isDevelopment', false);

  decorators.router.createEndpointDecorator('reactEntry');


  const shadowedReactEntry = decorators.router.reactEntry;
  decorators.router.reactEntry = function shadowedEntrypoint(options = {}) {

    if (typeof options === 'string') {
      options = {reactRoot: options};
    }

    return function createDecorator(target, field, descriptor) {

      if (!options.reactRoot) {
        // if there is nothing passed into the decorator
        // assume the the function name that is decorating
        // is the name of the page in client.
        //
        // @reactEntry()
        // helloworld(req, res) { res.renderRedux(); }
        //
        // Would end up mapping to {app_root}/client/pages/helloworld/entrypoint.js
        options.reactRoot = field.toLowerCase();
      }

      let beforeEntry = '';
      let afterEntry = '';

      const reactHandlerPaths = getReactHandlerPaths(options);

      const reactNS = getNamespace('http-request');
      reactNS.run(function() {

        const handerPathContext = {
          reactHandlerPaths,
        };

        reactNS.set('reactHandlerPaths', reactHandlerPaths);

        boring.performSync('requireHandlerPaths', handerPathContext, () => {
          requireHandlerPaths(reactHandlerPaths);
        });

        if (isDevelopment) {
          [beforeEntry, afterEntry] = dynamicComponents(
            reactHandlerPaths.reactRoot,
            reactHandlerPaths.containers,
            reactHandlerPaths.modulesToRequire,
            reactHandlerPaths.decorators
          );
        }

      });

      const entrypointPaths = [
        beforeEntry,
        reactHandlerPaths.entrypoint,
        afterEntry,
      ].filter(Boolean);

      // TODO / COULDDO, make entrypoint accept a promise
      // (which will queue an executing handler)
      // so we can convert the performSync('setReactHandlerPaths')
      // to an async call
      return decorators.router.entrypoint(...entrypointPaths)(
        target,
        field,
        shadowedReactEntry(reactHandlerPaths)(target, field, descriptor)
      );
    };
  };

  boring.after('add-routers', function({routers}) {
    BoringInjections.webpackDone.then(() => {
      BoringInjections.modules.requireGraph.clearRequireCache(paths.boring_app_dir + '/node_modules/requireDirectory.js');
      BoringInjections.modules.requireGraph.clearRequireCache(paths.boring_app_dir + '/node_modules/require-inject-all');
    });
  });

  boring.before('http::get', function beforeGet(ctx) {

    if (ctx.get.reactEntry) {
      ctx.res.reactPaths = ctx.get.reactEntry[0];
      ctx.res.renderRedux = renderRedux;
      const reactNS = getNamespace('http-request');

      if (reactNS && reactNS.set) {
        try {
          delete ctx.res.reactPaths.requestContext;
          /**
           * IMPORTANT, a fresh shallow clone is made
           * for every request so people can feel free
           * to assume this object is unique per request
           */
          reactNS.set('reactHandlerPaths', {
            ...ctx.res.reactPaths,
            containers: {
              ...ctx.res.reactPaths.containers,
            },
            decorators: {
              ...ctx.res.reactPaths.decorators,
            },
          });
        } catch (e) {
          logger.trace(e, 'problem setting reactHandlerPaths');
        }
      }
    }

    return Promise.resolve();
  });


  boring.react = {
    Layout,
  };

  return {name: 'react'};
};
