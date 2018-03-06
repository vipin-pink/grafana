///<reference path="../../../headers/common.d.ts" />

import _ from 'lodash';
import ResponseParser from './response_parser';
import PostgresQuery from './postgres_query';

export class PostgresDatasource {
  id: any;
  name: any;
  responseParser: ResponseParser;

  /** @ngInject **/
  constructor(instanceSettings, private backendSrv, private $q, private templateSrv) {
    this.name = instanceSettings.name;
    this.id = instanceSettings.id;
    this.responseParser = new ResponseParser(this.$q);
  }

  interpolateVariable(value, variable) {
    if (typeof value === 'string') {
      if (variable.disableWrapWithQuotes) {
        return value;
      } else {
        return "'" + value + "'";
      }
    }

    if (typeof value === 'number') {
      return value;
    }

    var quotedValues = _.map(value, function(val) {
      if (variable.disableWrapWithQuotes) {
        return val;
      } else {
        return "'" + val + "'";
      }
    });
    return  quotedValues.join(',');
  }

  query(options) {
    var queries = _.filter(options.targets, target => {
      return target.hide !== true;
    }).map(target => {
      var queryModel = new PostgresQuery(target, this.templateSrv, options.scopedVars);
      return {
        refId: target.refId,
        intervalMs: options.intervalMs,
        maxDataPoints: options.maxDataPoints,
        datasourceId: this.id,
        rawSql: queryModel.render(this.interpolateVariable),
        format: target.format,
      };
    });

    if (queries.length === 0) {
      return this.$q.when({data: []});
    }

    return this.backendSrv.datasourceRequest({
      url: '/api/tsdb/query',
      method: 'POST',
      data: {
        from: options.range.from.valueOf().toString(),
        to: options.range.to.valueOf().toString(),
        queries: queries,
      }
    }).then(this.responseParser.processQueryResult);
  }

  annotationQuery(options) {
    if (!options.annotation.rawQuery) {
      return this.$q.reject({message: 'Query missing in annotation definition'});
    }

    const query = {
      refId: options.annotation.name,
      datasourceId: this.id,
      rawSql: this.templateSrv.replace(options.annotation.rawQuery, options.scopedVars, this.interpolateVariable),
      format: 'table',
    };

    return this.backendSrv.datasourceRequest({
      url: '/api/tsdb/query',
      method: 'POST',
      data: {
        from: options.range.from.valueOf().toString(),
        to: options.range.to.valueOf().toString(),
        queries: [query],
      }
    }).then(data => this.responseParser.transformAnnotationResponse(options, data));
  }

  metricFindQuery(query, optionalOptions) {
    let refId = 'tempvar';
    if (optionalOptions && optionalOptions.variable && optionalOptions.variable.name) {
      refId = optionalOptions.variable.name;
    }

    const interpolatedQuery = {
      refId: refId,
      datasourceId: this.id,
      rawSql: this.templateSrv.replace(query, {}, this.interpolateVariable),
      format: 'table',
    };

    return this.backendSrv.datasourceRequest({
      url: '/api/tsdb/query',
      method: 'POST',
      data: {
        queries: [interpolatedQuery],
      }
    })
    .then(data => this.responseParser.parseMetricFindQueryResult(refId, data));
  }

  testDatasource() {
    return this.backendSrv.datasourceRequest({
      url: '/api/tsdb/query',
      method: 'POST',
      data: {
        from: '5m',
        to: 'now',
        queries: [{
          refId: 'A',
          intervalMs: 1,
          maxDataPoints: 1,
          datasourceId: this.id,
          rawSql: "SELECT 1",
          format: 'table',
        }],
      }
    }).then(res => {
      return { status: "success", message: "Database Connection OK"};
    }).catch(err => {
      console.log(err);
      if (err.data && err.data.message) {
        return { status: "error", message: err.data.message };
      } else {
        return { status: "error", message: err.status };
      }
    });
  }
}

