
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {StaticRouter} from 'react-router-dom';
import Layout from './Layout';
import getAppComponents from './AppInitProxy';
import Loadable from 'react-loadable';
import {getBundles} from 'react-loadable/webpack';
import {frontloadServerRender, Frontload} from 'react-frontload';
import getRootComponents from './getNodeRootComponents';
import {Helmet} from 'react-helmet';


module.exports = function renderRedux(options = {components: {}, layout: {clientConfig: {}, pageInjections: {}}}) {

  const res = this;
  const req = res.req;

  const context = {};

  const rootComponents = getRootComponents();

  const MainApp = rootComponents.modules.mainApp;
  const appTheme = rootComponents.modules.appTheme;
  const appDecorator = rootComponents.modules.appDecorator;

  const App = appDecorator(function AppWrapper() {
    return (
      <MainApp theme={appTheme()} />
    );
  });

  const reducers = rootComponents.modules.reducers;

  const modules = [];
  const stats = require(process.cwd() + '/dist/react-loadable.json');


  function Router(props) {
    return (
      <StaticRouter location={req.url} context={context} props={props}>
        <Frontload isServer={true}>
          <Loadable.Capture report={moduleName => modules.push(moduleName)}>
            {props.children}
          </Loadable.Capture>
        </Frontload>
      </StaticRouter>
    );
  }

  const layout = {
    clientConfig: {},
    pageInjections: {},
    ...options.layout,
  };

  if (!layout.pageInjections.bodyEndScripts) {
    layout.pageInjections.bodyEndScripts = [];
  }
  if (!layout.pageInjections.headLinks) {
    layout.pageInjections.headLinks = [];
  }

  let getStyleSheets;
  let store;
  const componentOptions = options.components || {};

  /**
   * frontloadServerRender seems to be getting
   * the job done, but let's not become too reliant
   * upon this module as it's not documented super
   * well and doesn't have a huge amount of adoption.
   *
   * TODO: swap out or replace with own impl
   */
  return frontloadServerRender((dryRun) => {

    const components = getAppComponents({
      App,
      Router,
      reducers,
      ...componentOptions,
    });

    if (!dryRun) {
      getStyleSheets = components.getStyleSheets;
      store = components.store;
    }

    return ReactDOMServer.renderToString(<components.Container />);
  }).then((containerHTML) => {

    const bundles = getBundles(stats, modules);
    const helmet = Helmet.renderStatic();

    bundles
      .filter(bundle => bundle && bundle.file.endsWith('.js'))
      .map(bundle => '/' +bundle.file)
      .forEach(file => {
        if (layout.pageInjections.bodyEndScripts.indexOf(file) < 0) {
          layout.pageInjections.bodyEndScripts.push(file);
        }
      });

    bundles
      .filter(bundle => bundle && bundle.file.endsWith('.css'))
      .map(bundle => '/' +bundle.file)
      .forEach(file => {
        if (layout.pageInjections.headLinks.indexOf(file) < 0) {
          layout.pageInjections.headLinks.push(file);
        }
      });

    res.send('<!DOCTYPE html>\n' + ReactDOMServer.renderToStaticMarkup(
      <Layout
        inlineCSS={getStyleSheets()}
        locals={res.locals}
        helmet={helmet}
        containerHTML={containerHTML}
        redux_state={store.getState()}
        {...layout}
      >
      </Layout>
    ));

  });

};

