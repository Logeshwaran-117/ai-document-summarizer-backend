require('dotenv').config();
const { generatePresentationViaSVG } = require('./services/svgPipelineService');
const fs = require('fs');

async function testPipeline() {
  console.log('Testing generatePresentationViaSVG pipeline...');
  const sampleDoc = `Executive Summary 2026
Q3 Financial Results:
- Total Revenue: $45.2 Million (+18% YoY)
- Net Profit Margin: 24.5%
- Customer Acquisition Cost: $140
Key Takeaways:
1. Operational expansion in APAC region resulted in 32% growth.
2. Cloud infrastructure cost reduced by 15% through optimization.
3. Recommended next steps: Increase marketing budget for Q4 product launch.`;

  try {
    const result = await generatePresentationViaSVG(sampleDoc, { title: "Test Financial Summary", slideCount: 3 });
    console.log(`✅ SUCCESS! Generated presentation with ${result.slideCount} slides (${result.buffer.length} bytes)`);
  } catch (err) {
    console.error('❌ Pipeline Error:', err);
  } finally {
    if (fs.existsSync('test_pipeline.js')) fs.unlinkSync('test_pipeline.js');
  }
}

testPipeline();
