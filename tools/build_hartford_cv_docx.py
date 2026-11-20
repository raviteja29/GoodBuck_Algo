from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from xml.sax.saxutils import escape


OUT = Path("RaviTeja_Hartford_CV.docx")


BLUE = "153E75"
DARK = "102A43"
GRAY = "52606D"
BODY = "1F2933"


def attrs(items):
    return " ".join(f'w:{k}="{v}"' for k, v in items.items())


def text_run(text, *, bold=False, italic=False, color=BODY, size=21):
    rpr = [f'<w:color w:val="{color}"/>', f'<w:sz w:val="{size}"/>', f'<w:szCs w:val="{size}"/>']
    if bold:
        rpr.insert(0, "<w:b/>")
    if italic:
        rpr.insert(0, "<w:i/>")
    return f"<w:r><w:rPr>{''.join(rpr)}</w:rPr><w:t xml:space=\"preserve\">{escape(text)}</w:t></w:r>"


def paragraph(runs, *, style=None, spacing_after=80, spacing_before=0, num=False, keep_next=False):
    ppr = []
    if style:
        ppr.append(f'<w:pStyle w:val="{style}"/>')
    if keep_next:
        ppr.append("<w:keepNext/>")
    if num:
        ppr.append('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')
    ppr.append(f'<w:spacing w:before="{spacing_before}" w:after="{spacing_after}" w:line="276" w:lineRule="auto"/>')
    return f"<w:p><w:pPr>{''.join(ppr)}</w:pPr>{''.join(runs)}</w:p>"


def p(text, **kwargs):
    return paragraph([text_run(text)], **kwargs)


def bullet(text):
    return paragraph([text_run(text, size=20)], num=True, spacing_after=45)


def h1(text):
    return paragraph([text_run(text, bold=True, color=BLUE, size=44)], style="Title", spacing_after=25)


def subtitle(text):
    return paragraph([text_run(text, bold=True, color=DARK, size=23)], style="Subtitle", spacing_after=55)


def contact(text):
    return paragraph([text_run(text, color=GRAY, size=18)], style="Contact", spacing_after=130)


def section(text):
    return paragraph([text_run(text.upper(), bold=True, color=BLUE, size=25)], style="Heading1", spacing_before=135, spacing_after=55, keep_next=True)


def company(name, dates):
    return paragraph(
        [
            text_run(name, bold=True, color=DARK, size=22),
            text_run("  |  ", color=GRAY, size=20),
            text_run(dates, bold=True, color=GRAY, size=20),
        ],
        style="Heading2",
        spacing_before=95,
        spacing_after=25,
        keep_next=True,
    )


def role(title, meta):
    title_para = paragraph(
        [
            text_run(title, bold=True, color=DARK, size=21),
        ],
        spacing_after=10,
        keep_next=True,
    )
    meta_para = paragraph([text_run(meta, italic=True, color=GRAY, size=18)], spacing_after=45, keep_next=True)
    return title_para + meta_para


def skill(label, value):
    return paragraph(
        [
            text_run(label + ": ", bold=True, color=BLUE, size=20),
            text_run(value, size=20),
        ],
        spacing_after=45,
    )


def earlier(label, detail, dates):
    return paragraph(
        [
            text_run(label, bold=True, color=DARK, size=20),
            text_run(" - " + detail + " ", size=20),
            text_run(dates, italic=True, color=GRAY, size=19),
        ],
        num=True,
        spacing_after=45,
    )


body = []

body += [
    h1("Ravi Teja Peetla"),
    subtitle("Senior Technical Architect | GenAI, Applied AI, Data Engineering and Cloud AI Solutions"),
    contact("Email: raviteja.peetla@gmail.com | Phone: +91 8142755756 | LinkedIn: www.linkedin.com/in/ravi-teja-292023143"),
    section("Professional Profile"),
    p(
        "Senior Technical Architect with nearly 15 years of experience designing and delivering AI, ML, data engineering and enterprise cloud solutions. Strong recent focus on insurance and financial-services use cases, including GenAI assistants, retrieval-augmented generation, natural-language query systems, loss-run document extraction, fraud/churn/loan models and large-scale data pipelines.",
        spacing_after=70,
    ),
    p(
        "Hands-on architect across Azure OpenAI, AWS Bedrock, Google Vertex AI, LangChain, Python, Spark/PySpark, Azure Cognitive Search, AWS Textract, serverless platforms, Docker, Kubernetes and CI/CD. Experienced in leading teams, converting POCs into production-ready platforms, and building evaluation, monitoring and governance-ready workflows for enterprise AI applications.",
        spacing_after=85,
    ),
    section("Hartford-Relevant Strengths"),
    bullet("Insurance AI experience across Arch Insurance and Aurenity, including loss-run extraction, structured insurance data mapping, SQL/NoSQL assistants, semantic search and document intelligence."),
    bullet("Architected GenAI and RAG systems with prompt evaluation, hallucination tracking, accuracy/latency dashboards, secure enterprise integration and cost optimization."),
    bullet("Built automated cloud pipelines using Azure Functions, AWS Lambda, S3 triggers, Step Functions, App Service, RDS, Azure DevOps and GitHub Actions."),
    bullet("Delivered applied ML solutions for fraud detection, churn prediction, loan risk, customer segmentation, next-best offer and high-volume classification."),
    bullet("Led cross-functional engineering teams of up to 9 members with ownership across architecture, implementation, deployment, documentation and production support."),
    section("Core Skills"),
    skill("GenAI and LLMs", "Azure OpenAI, OpenAI APIs, AWS Bedrock, Google Vertex AI, GPT-4.1, LangChain, RAG, advanced RAG, embeddings, vector search, prompt engineering, prompt evaluation, Copilot Studio, agent workflows"),
    skill("Architecture", "Cloud-native solution design, serverless architecture, microservices, API integration, secure enterprise backends, observability, cost optimization, reusable AI frameworks"),
    skill("Data and ML", "Python, Spark, PySpark, Spark MLlib, Pandas, NumPy, Scikit-learn, TensorFlow, Keras, PyTorch, NLP, OpenCV, XGBoost, Random Forest, regression, classification, clustering"),
    skill("Cloud and DevOps", "Azure, AWS, GCP, Azure Cognitive Search, Azure App Service, Azure Functions, AWS Lambda, AWS Textract, S3, RDS, Docker, Kubernetes, AKS, EKS, Azure DevOps, GitHub Actions, AWS CodePipeline"),
    skill("Data Platforms", "SQL, NoSQL, MongoDB, FAISS, Hive, HDFS, Teradata, MySQL, PostgreSQL, Splunk, Qlik Sense, Informatica, ETL, data warehousing"),
    section("Selected Impact"),
    bullet("Processed 3,000+ insurance loss-run documents and converted them into 420,000+ structured records in AWS RDS."),
    bullet("Architected a natural-language SQL/NoSQL assistant for insurance data access using Azure OpenAI, LangChain and hybrid semantic search."),
    bullet("Designed ML classification solutions at very large scale, including 270M subscribers for Indosat, 4M subscribers for Ooredoo Kuwait and 300M financial transactions."),
    bullet("Built model evaluation dashboards tracking accuracy, latency, query correctness and hallucination rate for enterprise GenAI applications."),
    bullet("Created reusable GenAI components for prompt templates, RAG orchestration, evaluation pipelines and vector search utilities."),
    section("Professional Experience"),
    company("Coforge", "May 2024 - Present"),
    role("Senior Technical Architect - DBVoice | Client: Arch Insurance", "Feb 2025 - Present | Azure OpenAI, GPT-4.1, Azure Cognitive Search, Azure App Service, Azure Functions, LangChain, FAISS, MongoDB, Python, Flask, Azure DevOps"),
    bullet("Designed and implemented a natural-language to SQL/NoSQL translation engine for structured and unstructured insurance data access."),
    bullet("Architected the solution on Azure using GPT-4.1, large embeddings, LangChain and hybrid search for intent parsing, semantic retrieval and query generation."),
    bullet("Built an evaluation framework to measure query correctness, accuracy, latency and hallucination rate, with dashboards for ongoing model performance review."),
    bullet("Engineered secure Flask and Azure Functions backends supporting SQL/NoSQL integration, role-aware access patterns and enterprise deployment requirements."),
    bullet("Implemented FAISS and MongoDB hybrid search to combine semantic retrieval with keyword-based insurance data lookup."),
    bullet("Productionized the application through Azure DevOps CI/CD, automated tests, monitoring, versioned releases, architecture documentation and MLOps-ready workflows."),
    role("Senior Technical Architect - GenAI Architecture and POCs | Multiple Clients", "May 2024 - Present | Python, Azure OpenAI, AWS Bedrock, Vertex AI, LangChain, RAG, vector databases, Flask, FastAPI, React, Copilot Studio, Docker, GitHub Actions"),
    bullet("Designed and delivered GenAI POCs including conversational assistants, recommendation engines and agent-based workflows using LangChain and modern LLM architectures."),
    bullet("Developed RAG and advanced RAG pipelines with embeddings, hybrid search and multi-step orchestration for domain-specific conversational intelligence."),
    bullet("Built Copilot Studio extensions that connect LLM capabilities with enterprise data through secure connectors and custom AI behaviors."),
    bullet("Created reusable GenAI frameworks for evaluation, prompt templates, RAG orchestration and vector search to speed up delivery across client engagements."),
    bullet("Led architecture, implementation, optimization and deployment with emphasis on scalable, cost-efficient and production-ready cloud design."),
    role("Senior Technical Architect - Loss Run File Extraction | Client: Aurenity", "Oct 2024 - Feb 2025 | AWS Textract, AWS Lambda, S3, RDS MySQL, Python, spaCy NER, Step Functions, Docker, AWS CodePipeline, Pandas"),
    bullet("Architected and developed an automated pipeline to convert unstructured PDF insurance reports into structured JSON outputs."),
    bullet("Used AWS Textract and custom NER models to extract and map insurance fields with strong data quality controls."),
    bullet("Processed 3,000+ loss-run documents, producing 420,000+ structured records uploaded into AWS MySQL RDS."),
    bullet("Implemented event-driven processing with Lambda, S3 triggers and Step Functions for continuous ingestion, monitoring and retry handling."),
    bullet("Established CI/CD, logging, auditing, schema standardization, validation and error-handling workflows for production stability."),
    company("Virtusa Consulting Services Pvt Ltd", "May 2022 - May 2024"),
    role("Associate Architect - Project Infinity | Client: PMI", "Jun 2023 - May 2024 | Python, Azure Blob Storage, Azure Cognitive Services, Form Recognizer, Azure OpenAI, LangChain, Postman, Swagger, Scikit-learn"),
    bullet("Led a 7-member team delivering a proprietary-document GenAI question-answering solution on Azure."),
    bullet("Built pipelines to collect PDF and web-scraped content, store it in Azure Blob Storage and extract text using Form Recognizer."),
    bullet("Implemented Azure Cognitive Search and prompt flows for query, answer and follow-up generation grounded in proprietary content."),
    bullet("Evaluated model responses using LangChain and created dashboards to track accuracy as new content was uploaded."),
    bullet("Used Azure Functions to trigger chunking and preprocessing scripts for improved retrieval quality."),
    role("Associate Architect - Solution Central Apps | Client: Anthem", "May 2022 - Jun 2023 | Python, Splunk, Scikit-learn, Matplotlib, Teradata, Splunk Visualization"),
    bullet("Led a 4-member team building analytics and ML workflows over JSON, CSV and database sources."),
    bullet("Processed data in Splunk using SPL and built classification/regression models for operational analytics."),
    bullet("Created visual analysis of model predictions in Splunk and scheduled production jobs using crontab."),
    company("Comviva Technologies", "Jan 2020 - Aug 2021"),
    role("Technical Lead - Customer Value Solutions | Clients: Ooredoo Kuwait, Indosat Indonesia", "Python, Scikit-learn, Keras, Matplotlib, Teradata, Qlik Sense, Unix, Crontab"),
    bullet("Led a 9-member team building churn, port-out, next-recharge, latest-offer and next-best-offer models."),
    bullet("Created Teradata data marts by joining 40+ tables and prepared modeling datasets for large-scale customer analytics."),
    bullet("Designed classification methods for 270M Indosat subscribers and 4M Ooredoo Kuwait subscribers."),
    bullet("Productionized models using Teradata BTEQ scripts, shell commands and crontab, and delivered dashboards in Qlik Sense."),
    company("Virtusa Consulting Services Pvt Ltd", "May 2018 - Jan 2020"),
    role("Lead Consultant - EPIC Project | Client: M&T Bank", "Python, Scikit-learn, Matplotlib, Spark, PySpark, Keras, H2O"),
    bullet("Built credit card fraud detection, customer churn and bad-loan prediction models for banking data products."),
    bullet("Performed data wrangling, preprocessing, scaling, normalization, imputation and feature engineering in Python."),
    bullet("Used text mining and regular expressions to develop domain-specific dictionaries for classification workflows."),
    bullet("Designed classification methods to categorize 300M business transactions by category and channel type into 60K business entities."),
    bullet("Developed customer segmentation, credit scoring and pricing models using ML and deep learning techniques."),
    company("Earlier Experience", "Jun 2011 - May 2018"),
    earlier("OSI Technologies Pvt Ltd, Principal Engineer", "Built handwritten digit classification models using DNN, KNN, TensorFlow and image preprocessing techniques.", "Jul 2017 - May 2018"),
    earlier("LiquidHub India Pvt Ltd, Software Engineer", "Built univariate and multivariate car-sales prediction models using TensorFlow, Keras, Python, Pandas and NumPy; achieved close to 95% accuracy.", "Jan 2017 - May 2017"),
    earlier("Kofax India Pvt Ltd, Software Engineer", "Developed classification models using TensorFlow, Keras and Python, including web scraping, decision tree/random tree modeling and validation with confusion matrices; achieved 92% accuracy.", "Feb 2015 - Jan 2017"),
    earlier("Bodh Tree Consulting Ltd, Software Engineer", "Delivered ETL, testing and BPM work across GE Capital and Total Agility projects using Informatica, Unix, Teradata, SQL Server, .NET, Azure and Agile delivery practices.", "Jun 2011 - Jan 2015"),
]


document_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" mc:Ignorable="w14 w15 wp14">
  <w:body>
    {''.join(body)}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="720" w:right="760" w:bottom="720" w:left="760" w:header="360" w:footer="360" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>'''


styles_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="{BODY}"/></w:rPr>
    </w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:qFormat/><w:rPr><w:b/><w:color w:val="{BLUE}"/><w:sz w:val="44"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:qFormat/><w:rPr><w:b/><w:color w:val="{DARK}"/><w:sz w:val="23"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Contact"><w:name w:val="Contact"/><w:qFormat/><w:rPr><w:color w:val="{GRAY}"/><w:sz w:val="18"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="{BLUE}"/><w:sz w:val="25"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="{DARK}"/><w:sz w:val="22"/></w:rPr></w:style>
</w:styles>'''


numbering_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:tabs><w:tab w:val="num" w:pos="360"/></w:tabs><w:ind w:left="360" w:hanging="180"/></w:pPr>
      <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:hint="default"/></w:rPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>'''


content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>'''


rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>'''


doc_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>'''


settings_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="720"/>
  <w:compat/>
</w:settings>'''


core_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Ravi Teja Peetla - Hartford CV</dc:title>
  <dc:creator>Ravi Teja Peetla</dc:creator>
  <cp:lastModifiedBy>Ravi Teja Peetla</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-06-03T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-06-03T00:00:00Z</dcterms:modified>
</cp:coreProperties>'''


app_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Office Word</Application>
</Properties>'''


with ZipFile(OUT, "w", ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", rels)
    z.writestr("docProps/core.xml", core_xml)
    z.writestr("docProps/app.xml", app_xml)
    z.writestr("word/document.xml", document_xml)
    z.writestr("word/_rels/document.xml.rels", doc_rels)
    z.writestr("word/styles.xml", styles_xml)
    z.writestr("word/numbering.xml", numbering_xml)
    z.writestr("word/settings.xml", settings_xml)

print(OUT.resolve())
