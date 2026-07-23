/**
 * components/index.js
 * Central export registry for all presentation components.
 */

const TitleComponent = require("./Title");
const MetricCardComponent = require("./MetricCard");
const TableComponent = require("./Table");
const ChartComponent = require("./ChartComponent");
const TimelineComponent = require("./TimelineComponent");
const ProcessArrowComponent = require("./ProcessArrow");
const ComparisonComponent = require("./Comparison");
const QuoteComponent = require("./Quote");
const FooterComponent = require("./Footer");
const ImageCardComponent = require("./ImageCard");

module.exports = {
  TitleComponent,
  MetricCardComponent,
  TableComponent,
  ChartComponent,
  TimelineComponent,
  ProcessArrowComponent,
  ComparisonComponent,
  QuoteComponent,
  FooterComponent,
  ImageCardComponent,
};
