const signedUrlCache =
  new Map();

export default {
  async fetch(request, env) {
    try {

      const url =
        new URL(request.url);

      console.error(
        "IP=" +
        (request.headers.get("cf-connecting-ip") || "")
      );

      console.error(
        "UA=" +
        (request.headers.get("user-agent") || "")
      );

      console.error(
        "PATH=" + url.pathname
      );

      console.error(
        "METHOD=" +
        request.method
      );

      const MODELS =
        getModels(env);

      const MODEL_COST =
        getModelCost(env)

      const DAILY_BUDGET =
        Number(env.DAILY_BUDGET || 1)

      const DAILY_REQUEST_LIMIT =
        Number(env.DAILY_REQUEST_LIMIT || 500)

      // =====================
      // Auth
      // =====================

      const auth =
        request.headers.get("Authorization") || ""

      const token =
        auth.replace("Bearer ", "")

      if (token !== env.API_KEY) {
        return json(
          { error: "Unauthorized" },
          401
        )
      }

      // =====================
      // Models
      // =====================

      if (url.pathname === "/api/show") {
        return json({
          name: "cf-ai-router",
          modified_at: new Date().toISOString(),
          details: {}
        });
      }

      if (url.pathname === "/v1/models") {
        return json({
          object: "list",
          data: [
            {
              id: "auto",
              object: "model",
              owned_by: "ai-router"
            },
            {
              id: "chat",
              object: "model",
              owned_by: "ai-router"
            },
            {
              id: "analyst",
              object: "model",
              owned_by: "ai-router"
            },
            {
              id: "coder",
              object: "model",
              owned_by: "ai-router"
            }
          ]
        });
      }

      // =====================
      // Stats
      // =====================

      if (url.pathname === "/stats") {

        const today = getToday()

        let data =
          await env.COST_KV.get(today)

        data = data
          ? JSON.parse(data)
          : {
            cost: 0,
            count: 0
          }

        return json({
          date: today,
          budget: DAILY_BUDGET,
          request_limit:
            DAILY_REQUEST_LIMIT,
          total_cost:
            data.cost,
          total_requests:
            data.count,
          remaining_budget:
            Number(
              (
                DAILY_BUDGET -
                data.cost
              ).toFixed(6)
            )
        })
      }

      // =====================
      // Health
      // =====================

      if (
        request.method === "GET" &&
        (
          url.pathname === "/" ||
          url.pathname === "/v1"
        )
      ) {
        return json({
          status: "ok",
          service: "cf-ai-router"
        })
      }

      // =====================
      // Endpoint Validation
      // =====================

      if (
        request.method !== "POST"
      ) {
        return json(
          {
            error:
              "Method Not Allowed"
          },
          405
        )
      }

      if (
        url.pathname !== "/" &&
        url.pathname !==
        "/v1/chat/completions"
      ) {
        return json(
          { error: "Not Found" },
          404
        )
      }

      // =====================
      // Request
      // =====================

      const VISION_MAX_TOKENS =
        Number(
          env.VISION_MAX_TOKENS || 100
        )

      const VISION_PROMPT =
        env.VISION_PROMPT ||
        "简洁描述图片内容，重点提取文字、对象、图表和关键信息"

      const VISION_RESPONSE_MODE =
        env.VISION_RESPONSE_MODE ||
        "direct"

      const body =
        await request.json();

      const requestedModel =
        body.model || "auto";

      const stream = body?.stream === true;

      const REQUEST_ID =
        crypto.randomUUID();

      console.error(
        "REQUEST_ID=" +
        REQUEST_ID
      );

      const messages =
        body.messages || [
          {
            role: "user",
            content: "Hello"
          }
        ]

      console.error(
        "RAW_HAS_IMAGE=" +
        getImageUrls(messages).length
      );

      const last =
        messages.at(-1);

      const chatMessages =
        [...messages];

      const MAX_MESSAGES = 12;

      let trimmedMessages =
        chatMessages.slice(
          -MAX_MESSAGES
        );

      trimmedMessages =
        trimMessages(
          trimmedMessages,
          6000
        );

      // =============================
      // 先检查 Hermes 请求
      // =============================

      const originalLastUser =
        [...trimmedMessages]
          .reverse()
          .find(
            m => m.role === "user"
          );

      const continuePatterns =
        String(
          env.HERMES_CONTINUE_KEYWORDS || ""
        )
          .split(/[\n,;]/)
          .map(v =>
            v.trim().toLowerCase()
          )
          .filter(Boolean);

      const originalText =
        String(
          originalLastUser?.content || ""
        )
          .toLowerCase()
          .trim();

      console.error(
        "ORIGINAL_TEXT=" +
        originalText
      );

      console.error(
        "CONTINUE_KEYWORDS=" +
        JSON.stringify(
          continuePatterns
        )
      );

      const matchedPatterns =
        continuePatterns.filter(
          p =>
            originalText.includes(p)
        );

      console.error(
        "CONTINUE_MATCHED=" +
        JSON.stringify(
          matchedPatterns
        )
      );

      console.error(
        "ORIGINAL_LAST_USER=" +
        JSON.stringify(originalLastUser)
      );

      const isContinue =
        matchedPatterns.length > 0;

      console.error(
        "HERMES_CONTINUE=" +
        isContinue
      );

      if (isContinue) {

        console.error(
          "HERMES_CONTINUE_STREAM=" +
          stream
        );

        console.error(
          "HERMES_CONTINUE_REQUEST=" +
          JSON.stringify(body)
        );

        console.error(
          "HERMES_CONTINUE_BLOCKED"
        );

        if (stream) {

          console.error(
            "HERMES_CONTINUE_STREAM_RETURN"
          );

          return sseText(
            "Nothing to save."
          );
        }

        console.error(
          "HERMES_CONTINUE_JSON_RETURN"
        );

        return jsonOpenAI(
          "Nothing to save.",
          requestedModel
        );
      }


      // =============================
      // 再过滤消息
      // =============================

      trimmedMessages =
        trimmedMessages.filter(m => {

          if (m.role !== "user") {
            return true;
          }

          const text =
            String(
              m.content || ""
            ).toLowerCase();

          const blocked =
            continuePatterns.some(
              p =>
                text.includes(p)
            );

          return !blocked;

        });

      // =============================
      // 正常流程
      // =============================

      const query =
        getSearchQuery(
          trimmedMessages
        );

      console.error(
        "QUERY_RAW=" +
        query
      );

      const cleanMessages =
        trimmedMessages
          .filter(
            m =>
              m.role !== "system"
          )
          .slice(-20);

      console.error(
        "CLEAN_MESSAGE_COUNT=" +
        cleanMessages.length
      );

      // =====================
      // Hermes Image Summary
      // =====================

      const hermesImageKeywords =
        (
          env.HERMES_IMAGE_KEYWORDS ||
          ""
        )
          .split("\n")
          .map(v =>
            v.trim().toLowerCase()
          )
          .filter(Boolean);

      const imageHits =
        hermesImageKeywords.filter(
          keyword =>
            query
              .toLowerCase()
              .includes(keyword)
        ).length;

      const lastUserMessage =
        [...messages]
          .reverse()
          .find(
            m =>
              m.role === "user"
          );

      const lastUserText =
        extractMessageText(
          lastUserMessage
        );

      const isHermesSummary =
        isHermesImageSummary(
          lastUserText
        );

      console.error(
        "IS_HERMES_IMAGE_SUMMARY=" +
        isHermesSummary
      );

      logPreview(
        "FINAL QUERY:",
        query
      );

      let imageUrls =
        getImageUrls(
          trimmedMessages
        );

      let restoredFromState =
        false;

      console.error(
        "TRIMMED_IMAGE_COUNT=" +
        getImageUrls(trimmedMessages).length
      );

      let hasNativeImage =
        imageUrls.length > 0;

      console.error(
        "HAS_NATIVE_IMAGE_FOR_COMMAND=" +
        hasNativeImage
      );

      let effectiveQuery =
        query;

      console.error(
        "VISION_PROMPT_VALUE=" +
        VISION_PROMPT
      );

      if (isHermesSummary) {

        console.error(
          "HERMES_SUMMARY_DIRECT_RETURN"
        );

        if (stream) {
          return sseText(lastUserText);
        }

        return jsonOpenAI(
          lastUserText,
          requestedModel
        );
      }

      let hasVisionRequest =
        hasNativeImage;

      let visionConfig = null;

      if (hasVisionRequest) {

        visionConfig =
          getVisionConfig(
            query,
            MODELS,
            env
          );

        console.error(
          "VISION_CONFIG=" +
          JSON.stringify(
            visionConfig
          )

        );

      } else {

      }

      const hasImage =
        imageUrls.length > 0;

      const shouldRunVision =
        hasVisionRequest &&
        imageUrls.length > 0;

      let shouldSaveImage =
        hasNativeImage;

      console.error(
        "SHOULD_SAVE_IMAGE=" +
        shouldSaveImage
      );

      console.error(
        "HAS_NATIVE_IMAGE=" +
        hasNativeImage
      );

      console.log(
        "HAS IMAGE:",
        hasImage
      )

      console.error(
        "IMAGE_URL_COUNT",
        imageUrls?.length
      )

      if (
        imageUrls.length > 10
      ) {

        return json(
          {
            error:
              "Maximum 10 images"
          },
          400
        )
      }

      const tools = []

      const temperature =
        typeof body.temperature === "number"
          ? body.temperature
          : undefined

      let max_tokens =
        Number(
          body.max_tokens || 4096
        )

      if (
        !Number.isFinite(max_tokens) ||
        max_tokens < 1
      ) {
        max_tokens = 4096
      }

      max_tokens =
        Math.min(
          max_tokens,
          2048
        )

      // =====================
      // Usage Control
      // =====================

      const today =
        getToday()

      let data =
        await env.COST_KV.get(today)

      data = data
        ? JSON.parse(data)
        : {
          cost: 0,
          count: 0
        }

      if (
        data.cost >=
        DAILY_BUDGET
      ) {
        return json(
          {
            error:
              "Daily budget exceeded",
            budget:
              DAILY_BUDGET,
            used:
              data.cost
          },
          429
        )
      }

      if (
        data.count >=
        DAILY_REQUEST_LIMIT
      ) {
        return json(
          {
            error:
              "Daily request limit exceeded",
            limit:
              DAILY_REQUEST_LIMIT,
            used:
              data.count
          },
          429
        )
      }

      // =====================
      // Router
      // =====================

      const remaining =
        DAILY_BUDGET -
        data.cost

      const length =
        JSON.stringify(trimmedMessages)
          .length

      let model

      switch (requestedModel) {

        case "chat":
          model = MODELS.CHAT
          break

        case "analyst":
          model = MODELS.ANALYST
          break

        case "coder":
          model = MODELS.CODER
          break

        case "auto":
        default:

          const queryLower = query.toLowerCase()

          const codingKeywords = [
            "code",
            "coding",
            "python",
            "javascript",
            "typescript",
            "java",
            "c#",
            "go",
            "rust",
            "sql",
            "api",
            "react",
            "vue",
            "spring",
            "docker",
            "kubernetes",
            "debug",
            "bug",
            "fix",
            "refactor",
            "review",
            "git"
          ]

          const codingHit =
            codingKeywords.some(k =>
              queryLower.includes(k)
            )

          if (remaining < 0.05) {

            model = MODELS.CHAT

          }
          else if (length > 15000) {

            model = MODELS.CODER

          }
          else if (
            isCodingQuery(query, env)
          ) {

            model = MODELS.CODER

          }
          else if (
            isChatQuery(query, env)
          ) {

            model = MODELS.CHAT

          }
          else {

            model = MODELS.ANALYST

          }

      }

      // =====================
      // Stream Bypass Config
      // =====================

      const streamBypassKeywords =
        (env.STREAM_BYPASS_KEYWORDS || "")
          .split(",")
          .map(v => v.trim())
          .filter(Boolean)

      const queryLower =
        query.toLowerCase()

      const bypassStream =
        streamBypassKeywords.some(
          keyword =>
            queryLower.includes(
              keyword.toLowerCase()
            )
        )

      // =====================
      // CRYPTO / Stock Detection
      // =====================

      const cryptoMap =
        JSON.parse(
          env.CRYPTO_SYMBOLS || "{}"
        );

      const cryptoCodes =
        Object.values(
          cryptoMap
        ).map(v =>
          String(v).toUpperCase()
        );

      const rawQuery =
        query.trim();

      const symbol =
        rawQuery.toUpperCase();

      const stockKeywords =
        String(
          env.STOCK_KEYWORDS || ""
        )
          .split(",")
          .map(v => v.trim())
          .filter(Boolean);

      const hasStockKeyword =
        stockKeywords.some(
          keyword =>
            rawQuery
              .toLowerCase()
              .includes(
                keyword.toLowerCase()
              )
        );

      const isTickerLike =
        /^[A-Z]{1,6}$/.test(
          symbol
        );

      const isStockRequest =

        hasStockKeyword

        ||

        (
          isTickerLike &&
          !cryptoCodes.includes(
            symbol
          )
        );


      // =====================
      // Date / Time Intercept
      // =====================

      const dateResponse =
        await handleDateTimeQuery(
          query,
          stream,
          requestedModel,
          env
        );

      if (dateResponse) {
        return dateResponse;
      }

      // =====================
      // Continue Business Logic
      // =====================
      //
      // 天气
      // 股票
      // 加密货币
      // 搜索
      // AI Run
      //

      // =====================
      // AI Run
      // =====================

      let aiRes

      let runtimeMessages =
        trimmedMessages

      let searchContext = ""

      const fallbackErrors = [];

      try {

        console.error(
          "MODEL_PATH_ENTER=" +
          REQUEST_ID
        );

        const hasNativeImage =
          trimmedMessages.some(
            m =>
              Array.isArray(m.content) &&
              m.content.some(
                p => p.type === "image_url"
              )
          );

        if (hasNativeImage) {

          console.error(
            "VISION_NATIVE_HIT"
          );

        }

        console.error(
          "HAS_NATIVE_IMAGE",
          hasNativeImage
        );

        let hasAnyImage =
          imageUrls &&
          imageUrls.length > 0;

        console.error(
          "HAS_ANY_IMAGE=" +
          hasAnyImage
        );

        console.error(
          "IMAGE_URL_COUNT_AFTER_RESTORE=" +
          (imageUrls?.length || 0)
        );

        if (shouldRunVision) {

          let imageId = null;

          console.error(
            "VISION_RESPONSE_MODE=" +
            String(
              VISION_RESPONSE_MODE
            )
          );

          console.error(
            "IMAGE_URL_COUNT",
            imageUrls?.length || 0
          );

          const visionMaxTokens =
            Math.min(
              max_tokens,
              VISION_MAX_TOKENS
            );

          console.error(
            "PROCESS_MULTI_START"
          );

          const imageResult =
            await processMultipleImages({
              env,
              imageUrls,
              effectiveQuery,
              visionConfig,
              visionMaxTokens,
              MODELS,
              VISION_PROMPT
            });

          const imageContexts =
            imageResult.filtered;

          if (imageResult.fromR2) {

            console.error(
              "IMAGE_FROM_R2_SKIP_SAVE"
            );

            shouldSaveImage =
              false;

          }

          console.error(
            "FINAL_SHOULD_SAVE_IMAGE=" +
            shouldSaveImage
          );

          if (shouldSaveImage) {

            imageId =
              await generateImageId(
                env
              );

            console.error(
              "GENERATED_IMAGE_ID=" +
              imageId
            );

            if (
              typeof imageUrls[0] === "string" &&
              imageUrls[0].endsWith(".json")
            ) {

              console.error(
                "SKIP_SAVE_JSON_REFERENCE=" +
                imageUrls[0]
              );

            } else {

              await saveImageState(
                env,
                imageId,
                imageUrls[0]
              );

            }

            await env.IMAGES_BUCKET.put(
              "image-state/LAST_IMAGE_ID.txt",
              imageId
            );

            console.error(
              "LAST_IMAGE_ID_SAVED=" +
              imageId
            );

            console.error(
              "IMAGE_ID=" +
              imageId
            );

          }

          console.error(
            "PROCESS_MULTI_DONE=" +
            imageContexts.length
          );

          if (
            imageContexts.length === 0
          ) {

            console.error(
              "IMAGE_CONTEXT_EMPTY"
            );

            return jsonOpenAI(
              "IMAGE_CONTEXT_EMPTY",
              requestedModel
            );

          }

          // 如果是 direct 模式，在这里立刻短路返回！

          if (
            VISION_RESPONSE_MODE === "direct"
          ) {

            console.error(
              "STREAM_MODE=" + stream
            );

            console.error(
              "IMAGE_CONTEXTS=" +
              imageContexts.length
            );

            console.error(
              "IMAGE_ID_BEFORE_CONTENT=" +
              imageId
            );

            const content =
              imageContexts.join("\n\n") +
              (
                imageId
                  ? `\n\n图片已保存（${imageId}）。`
                  : ""
              );

            console.error(
              "DIRECT_IMAGE_ID=" + imageId
            );

            console.error(
              "DIRECT_CONTENT=" + content
            );

            if (stream) {

              console.error(
                "FINAL_CONTENT=" + content
              );

              console.error(
                "FINAL_CONTENT_LENGTH=" +
                content.length
              );

              return sseText(content);
            }



            return jsonOpenAI(
              content,
              requestedModel
            );
          }

          // 非 direct 模式（如需要混合搜索、多轮深入对话），再往下进行拼接

          const mergedImageContext = imageContexts
            .map((v, i) => `图片${i + 1}：\n\n${v}`)
            .join("\n\n");

          // 无缝顺延到 shortQuery 判定、shouldSearch 搜索逻辑以及 runtimeMessages 拼装流程..

          const normalizedMessages =
            normalizeMessages(
              trimmedMessages
            )

          const cleanMessages =
            normalizedMessages
              .filter(
                m => m.role !== "system"
              )
              .slice(-20);

          const shortQuery =
            query.trim()

          // =====================
          // Date / Time Intercept
          // =====================

          const dateResponse =
            await handleDateTimeQuery(
              query,
              stream,
              requestedModel,
              env
            );

          if (dateResponse) {
            return dateResponse;
          }

          searchContext = ""
          let rankedResults = []

          const searchNeeded =
            await shouldSearch(
              query,
              env
            );

          console.error(
            "SEARCH_NEEDED=" +
            searchNeeded
          );

          console.error(
            "SEARCH_DECISION=" +
            JSON.stringify({
              hasImage,
              imageCount:
                imageUrls?.length || 0,
              query:
                query.slice(0, 300)
            })
          );

          if (searchNeeded) {

            try {

              let searchQuery = query

              const searchData =
                await searchWeb(
                  searchQuery,
                  env
                )

              searchContext =
                searchData.context

              rankedResults =
                searchData.results || []

              console.error(
                "RANKED_RESULTS_COUNT=" +
                rankedResults.length
              );

            } catch (e) {

              console.error(
                "Search Error:",
                e?.message || e
              )

              searchContext = ""
              rankedResults = []

            }

          }

          const systemPrompt = `
${getCurrentDatePrompt().content}

IMPORTANT:

Tool calling is NOT available.

Do NOT output:

<tool_call>
</tool_call>

web_search(
vision_analyze(
skill_view(
memory(
terminal(

The search has already been completed when needed.

Answer the user directly.

If search results are provided,
use them directly.

Never emit tool-call syntax.

${searchContext
              ? `

实时搜索结果：

${searchContext}

重要规则：

1. 只能使用 SEARCH RESULTS 中实际出现的内容回答。

2. 如果某条信息没有出现在 SEARCH RESULTS 中，
禁止提及。

3. 回答新闻类问题时：

- 优先列出搜索结果中的标题
- 引用对应摘要
- 引用对应来源

4. 不允许根据常识补充内容。

5. 不允许根据历史知识补充内容。

6. 不允许根据公司背景推测内容。

7. 不允许归纳不存在于搜索结果中的结论。

8. 如果 SEARCH RESULTS 中存在相关新闻标题或摘要，
必须优先列出这些搜索结果。

不要直接回答：
"搜索结果未提供足够信息。"

9. 只有当 SEARCH RESULTS 与用户问题完全无关时，
才回答：

"搜索结果未找到相关信息。"

禁止：

- 编造
- 猜测
- 推断
- 总结不存在的信息
- 补充背景知识
- 补充新闻细节
- 补充时间
- 补充数字
- 补充财务数据
- 补充产品发布信息

回答格式：

标题：
来源：
摘要：

标题：
来源：
摘要：

仅基于 SEARCH RESULTS 回答。
`
              : ""
            }
`;

          runtimeMessages = [
            {
              role: "system",
              content: systemPrompt
            },

            ...cleanMessages
          ];

          console.error(
            "RUNTIME_MESSAGE_COUNT=" +
            runtimeMessages.length
          );

          console.error(
            "PROMPT_SIZE=" +
            JSON.stringify(runtimeMessages)
              .length
          );

          if (
            JSON.stringify(
              runtimeMessages
            ).length > 100000
          ) {

            return json(
              {
                error:
                  "Image context too large"
              },
              400
            )

          }

          const params = {
            messages: runtimeMessages,
            temperature,
            max_tokens
          }

          if (tools?.length) {
            params.tools = tools
          }

          console.error(
            "MODEL_START=" +
            REQUEST_ID
          );

          console.error(
            "SYSTEM_COUNT=" +
            runtimeMessages.filter(
              m => m.role === "system"
            ).length
          );

          aiRes = await env.AI.run(
            model,
            params
          )

        } else {

          const dateResponse =
            await handleDateTimeQuery(
              query,
              stream,
              requestedModel,
              env
            );

          if (dateResponse) {
            return dateResponse;
          }

          // =====================
          // Weather
          // =====================

          if (
            isWeatherQuery(
              query
            )
          ) {

            return await handleWeather(
              query,
              env,
              stream,
              requestedModel
            )

          }

          // =====================
          // Crypto
          // =====================

          if (
            isCryptoQuery(
              query,
              env
            )
          ) {

            const cryptoResult =
              await handleCrypto(
                query,
                env,
                stream,
                requestedModel
              )

            if (cryptoResult) {

              return cryptoResult

            }

          }

          // =====================
          // Exchange Rate & Stock Price
          // =====================

          if (
            isExchangeRateQuery(
              query,
              env
            )
          ) {

            const fxResult =
              await handleExchangeRate(
                query,
                env,
                stream,
                requestedModel
              )

            if (fxResult) {
              return fxResult
            }
          }

          if (
            isStockRequest
          ) {

            const historyKeywords =
              (env.STOCK_HISTORY_KEYWORDS || "")
                .split(",")
                .map(v => v.trim())
                .filter(Boolean);

            const historyRequest =
              historyKeywords.length > 0 &&
              historyKeywords.some(
                keyword =>
                  query.includes(keyword)
              );

            const company =
              cleanStockQuery(
                query,
                env
              );

            const timeUnits =
              (env.TIME_UNIT || "")
                .split(",")
                .map(v => v.trim())
                .filter(Boolean)

            const hasTimeWord =
              timeUnits.some(
                word => company.includes(word)
              )

            const hasChineseCompany =
              /[\u4e00-\u9fa5]{2,}/.test(
                company
              );

            const hasEnglishCompany =
              /[A-Za-z]{2,}/.test(
                company
              );

            /**
             * 支持：
             * 600519
             * 300750
             * 000001
             * 0700
             * 9988
             */
            const hasStockCode =
              /^\d{4,6}$/.test(
                company
              );

            const hasCompanyName =
              hasChineseCompany ||
              hasEnglishCompany ||
              hasStockCode;

            const isNoCompanyQuery =

              !hasCompanyName ||

              (
                hasTimeWord &&
                !hasEnglishCompany &&
                !hasStockCode
              );

            console.error(
              "STOCK_QUERY=" +
              query
            );

            console.error(
              "CLEAN_COMPANY=" +
              company
            );

            console.error(
              "HAS_CHINESE=" +
              hasChineseCompany
            );

            console.error(
              "HAS_ENGLISH=" +
              hasEnglishCompany
            );

            console.error(
              "HAS_STOCK_CODE=" +
              hasStockCode
            );

            console.error(
              "HAS_COMPANY_NAME=" +
              hasCompanyName
            );

            console.error(
              "IS_NO_COMPANY_QUERY=" +
              isNoCompanyQuery
            );

            console.error(
              "LOOKS_LIKE_STOCK=" +
              looksLikeStockLookup(
                query
              )
            );

            if (isNoCompanyQuery) {

              const result =
                "请提供股票名称或代码，例如：Intel股价、SNAP一周股价、TSLA行情。"

              if (stream) {
                return sseText(result)
              }

              return jsonOpenAI(
                result,
                requestedModel
              )

            }

            let symbol = null

            // =====================
            // Symbol Cache Read
            // =====================

            try {

              const cacheKey =
                `verified:${normalizeCompanyName(
                  company
                )}`;

              const cachedSymbol =
                await env.SYMBOL_CACHE.get(
                  cacheKey
                );

              if (cachedSymbol) {

                const companyMatch =
                  await validateSymbolCompany(
                    cachedSymbol,
                    company,
                    env
                  );

                if (companyMatch) {

                  symbol =
                    cachedSymbol;

                } else {

                  await env.SYMBOL_CACHE.delete(
                    cacheKey
                  );

                }

              }

            } catch (e) {

              console.error(
                "SYMBOL CACHE READ ERROR:",
                e
              );

            }

            // =====================
            // Fallback Search
            // =====================

            if (
              !symbol &&
              looksLikeStockLookup(query)
            ) {

              symbol =
                await searchSymbol(
                  query,
                  env
                )

              console.error(
                "SEARCH_SYMBOL_RESULT=" +
                symbol
              );

              if (symbol) {

                const verify =
                  await getStockPrice(
                    symbol,
                    env
                  );

                // 已识别中国市场代码
                // 不允许继续Web Search

                if (
                  verify?.codeOnly
                ) {

                  return stream
                    ? sseText(
                      verify.message
                    )
                    : jsonOpenAI(
                      verify.message,
                      requestedModel
                    );

                }

                if (
                  !verify ||
                  typeof verify.c !== "number" ||
                  verify.c <= 0
                ) {

                  symbol = null;

                }

              }

            }

            // =====================
            // Fallback
            // Web Search
            // =====================

            if (
              !symbol &&
              looksLikeStockLookup(query)
            ) {

              const company =
                cleanStockQuery(
                  query,
                  env
                );

              const candidates =
                await searchSymbolFromWeb(
                  company,
                  env
                )

              let bestSymbol =
                null

              for (const candidate of candidates) {

                const verify =
                  await getStockPrice(
                    candidate.symbol,
                    env
                  );

                if (
                  !verify ||
                  typeof verify.c !== "number" ||
                  verify.c <= 0 ||
                  verify.t <= 0
                ) {
                  continue;
                }

                bestSymbol =
                  candidate.symbol;

                console.error(
                  "WEB_SYMBOL_PICKED=" +
                  bestSymbol
                );

                try {

                  await env.SYMBOL_CACHE.put(
                    `verified:${normalizeCompanyName(company)}`,
                    bestSymbol,
                    {
                      expirationTtl: 604800
                    }
                  );

                } catch (e) {

                  console.error(
                    "SYMBOL CACHE WRITE ERROR:",
                    e
                  );

                }

                break;

              }


              symbol =
                bestSymbol

            }

            // =====================
            // 最终失败
            // =====================

            if (!symbol) {

              const company =
                cleanStockQuery(
                  query,
                  env
                );

              const result =
                `${company} 未找到可验证的股票代码。`

              if (stream) {
                return sseText(result)
              }

              return jsonOpenAI(
                result,
                requestedModel
              )

            }

            let historyFallback =
              false

            if (historyRequest) {

              const history =
                await getStockHistory(
                  symbol,
                  env
                )

              if (
                history?.unsupported
              ) {

                if (stream) {
                  return sseText(
                    history.message
                  );
                }

                return jsonOpenAI(
                  history.message,
                  requestedModel
                );

              }

              if (
                history &&
                history.c &&
                history.c.length
              ) {

                const prices =
                  history.c
                    .slice(-7)
                    .join(" → ")

                const result =
                  `${symbol}

            最近7日价格：

${prices}

            最高：
${Math.max(...history.c)}

            最低：
${Math.min(...history.c)} `

                if (stream) {
                  return sseText(result)
                }

                return jsonOpenAI(
                  result,
                  requestedModel
                )

              }

              historyFallback =
                true

            }

            const stock =
              await getStockPrice(
                symbol,
                env
              )

            if (
              stock?.codeOnly
            ) {

              if (stream) {
                return sseText(
                  stock.message
                );
              }

              return jsonOpenAI(
                stock.message,
                requestedModel
              );

            }

            if (
              stock?.error ===
              "RATE_LIMIT"
            ) {

              const result =
                `行情服务访问频率超限，请稍后再试。

            股票代码：
${symbol} `

              if (stream) {
                return sseText(result)
              }

              return jsonOpenAI(
                result,
                requestedModel
              )

            }

            if (
              stock &&
              stock.c !== undefined &&
              stock.t
            ) {

              const result =
                `${historyFallback
                  ? "历史数据暂不可用，已自动切换为实时行情。\n\n"
                  : ""
                }${symbol}

现价：${stock.c}
涨跌：${stock.d}
涨跌幅：${stock.dp}%
最高：${stock.h}
最低：${stock.l}`;

              if (stream) {
                return sseText(result)
              }

              return jsonOpenAI(
                result,
                requestedModel
              )

            }

            // =====================
            // API 数据或失败
            // =====================

            const result =
              `${symbol} 未获取到有效行情数据。`;

            if (stream) {
              return sseText(result);
            }

            return jsonOpenAI(
              result,
              requestedModel
            );

          }

          // =====================
          // Search after stock sevice
          // =====================

          let needSearch = false

          console.error(
            "QUERY=" + query
          );

          console.error(
            "NEED_SEARCH=" +
            needSearch
          );

          if (

            !hasImage &&
            !bypassStream

          ) {

            needSearch =
              await shouldSearch(
                query,
                env
              )

          }

          searchContext = ""
          let rankedResults = []

          if (needSearch) {

            try {

              let searchQuery = query

              const searchData =
                await searchWeb(
                  searchQuery,
                  env
                )

              searchContext =
                searchData.context

              rankedResults =
                searchData.results || []

            } catch (e) {

              console.error(
                "Search Error:",
                e?.message || e
              )

              searchContext = ""
              rankedResults = []

            }

          }

          const isNewsQuery =
            /新闻|消息|动态|最新|最近|news/i
              .test(query)

          console.error(
            "QUERY=" + query
          );

          console.error(
            "NEED_SEARCH=" +
            needSearch
          );

          console.error(
            "IS_NEWS=" +
            isNewsQuery
          );

          console.error(
            "RANKED_RESULTS=" +
            rankedResults.length
          );

          logPreview(
            "SEARCH PREVIEW:",
            searchContext,
            300
          );

          // =====================
          // News Direct Return
          // =====================

          console.error(
            "RANKED_RESULTS=" +
            rankedResults.length
          );

          console.error(
            "NEWS_GATE=" +
            JSON.stringify({
              isNewsQuery,
              resultCount:
                rankedResults.length
            })
          );

          if (isNewsQuery) {

            console.error(
              "NEWS_STREAM=" + stream
            );

            if (rankedResults.length > 0) {
              const newsText = formatNewsResults(rankedResults);
              if (stream) {
                console.error(
                  "NEWS_DIRECT_STREAM_RETURN"
                );

                console.error(
                  "NEWS_TEXT_LENGTH=" +
                  newsText.length
                );

                return sseText(newsText);
              }

              return jsonOpenAI(newsText, requestedModel);
            }

            else {
              console.error("NEWS_GATE_BLOCKED: News keyword matched but results array is empty.");
              const fallbackText = "📰 实时新闻聚合服务暂不可用，请稍后再试或换个关键词提问（例如：输入特定的公司或行业加新闻）。";
              if (stream) { return sseText(fallbackText); }
              return jsonOpenAI(fallbackText, requestedModel);
            }
          }

          const systemPrompt = `
${getCurrentDatePrompt().content}

          IMPORTANT:

Tool calling is NOT available.

Do NOT output:

          <tool_call>
          </tool_call>

          web_search(
            vision_analyze(
              skill_view(
                memory(
                  terminal(

                    The search has already been completed when needed.

Answer the user directly.

If search results are provided,
                    use them directly.

Never emit tool - call syntax.

                    ${searchContext
              ? `

实时搜索结果：

${searchContext}

重要规则：

1. 只能使用 SEARCH RESULTS 中实际出现的内容回答。

2. 如果某条信息没有出现在 SEARCH RESULTS 中，
禁止提及。

3. 回答新闻类问题时：

- 优先列出搜索结果中的标题
- 引用对应摘要
- 引用对应来源

4. 不允许根据常识补充内容。

5. 不允许根据历史知识补充内容。

6. 不允许根据公司背景推测内容。

7. 不允许归纳不存在于搜索结果中的结论。

8. 如果 SEARCH RESULTS 中存在相关新闻标题或摘要，
必须优先列出这些搜索结果。

9. 只有当 SEARCH RESULTS 与用户问题完全无关时，
才回答：

"搜索结果未找到相关信息。"

禁止：

- 编造
- 猜测
- 推断
- 总结不存在的信息
- 补充背景知识
- 补充新闻细节
- 补充时间
- 补充数字
- 补充财务数据
- 补充产品发布信息

回答格式：

标题：
来源：
摘要：

标题：
来源：
摘要：

仅基于 SEARCH RESULTS 回答。
`
              : ""
            }
`

          runtimeMessages = [
            {
              role: "system",
              content: systemPrompt
            },

            ...cleanMessages
          ];

          console.error(
            "RUNTIME_MESSAGE_COUNT=" +
            runtimeMessages.length
          );

          console.error(
            "PROMPT_SIZE=" +
            JSON.stringify(runtimeMessages)
              .length
          );

          if (
            JSON.stringify(
              runtimeMessages
            ).length > 100000
          ) {

            return json(
              {
                error:
                  "Context too large"
              },
              400
            );

          }

          const params = {
            messages: runtimeMessages,
            temperature,
            max_tokens
          }

          if (tools?.length) {
            params.tools = tools
          }

          console.error(
            "MESSAGE_COUNT=" +
            runtimeMessages.length
          );

          console.error(
            "PROMPT_SIZE=" +
            JSON.stringify(
              runtimeMessages
            ).length
          );

          aiRes = await env.AI.run(
            model,
            params
          )
        }

      } catch (e) {

        fallbackErrors.push({
          model,
          message: e?.message || String(e)
        });

        console.error(
          "Primary Model Error:",
          e?.message || e
        );

        console.error(
          "PRIMARY_ERROR_STACK",
          e?.stack
        );

        if (
          String(e).includes("4006") ||
          e?.message?.includes("4006")
        ) {

          return json({

            id:
              "chatcmpl-" +
              crypto.randomUUID(),

            object:
              "chat.completion",

            created:
              Math.floor(
                Date.now() / 1000
              ),

            model:
              requestedModel,

            choices: [
              {
                index: 0,

                message: {
                  role: "assistant",
                  content:
                    searchContext ||
                    "Cloudflare AI额度已耗尽，请稍后再试。"
                },

                logprobs: null,

                finish_reason: "stop"
              }
            ]
          })

        }

        const fallbackChain = [
          MODELS.CODER,
          MODELS.ANALYST,
          MODELS.CHAT
        ]

        let currentIndex =
          fallbackChain.indexOf(model)

        if (
          currentIndex < 0
        ) {
          currentIndex = -1
        }

        let success = false

        while (
          currentIndex <
          fallbackChain.length - 1
        ) {

          currentIndex++

          model =
            fallbackChain[
            currentIndex
            ]

          try {

            const params = {
              messages: runtimeMessages,
              temperature,
              max_tokens
            }

            if (tools?.length) {
              params.tools = tools
            }

            console.error(
              "SYSTEM_COUNT=" +
              runtimeMessages.filter(
                m => m.role === "system"
              ).length
            );

            aiRes = await env.AI.run(
              model,
              params
            )

            success = true

            break

          } catch (e) {

            fallbackErrors.push({
              model,
              message: e?.message || String(e)
            });

            console.error(
              "Fallback Error:",
              model,
              e?.message || e
            );

            console.error(
              "FALLBACK_STACK",
              e?.stack
            );

          }

        }

        if (!success) {

          console.error(
            "ALL_MODEL_ERRORS",
            JSON.stringify(
              fallbackErrors,
              null,
              2
            )
          );

          throw new Error(
            `All models failed: ${fallbackErrors
              .map(v =>
                `${v.model}: ${v.message}`
              )
              .join(" | ")
            } `
          );

        }

      }

      // =====================
      // Assistant Message
      // =====================

      const assistantMessage = {
        role: "assistant"
      }

      let content =
        aiRes?.response ??
        aiRes?.content ??
        aiRes?.result?.response ??
        aiRes?.text ??
        aiRes?.output_text ??
        aiRes?.choices?.[0]?.message?.content ??
        aiRes?.choices?.[0]?.message?.reasoning ??
        aiRes?.choices?.[0]?.message?.reasoning_content ??
        null

      if (
        typeof content === "string"
      ) {

        content = content.replace(
          /<tool_call>[\s\S]*?<\/tool_call>/gi,
          ""
        )

        content = content.replace(
          /web_search\s*\([^)]*\)/gi,
          ""
        )

        content = content.replace(
          /vision_analyze\s*\([^)]*\)/gi,
          ""
        )

        content = content.replace(
          /skill_view\s*\([^)]*\)/gi,
          ""
        )

        content = content.trim()

      }

      const toolCalls =
        aiRes?.tool_calls ??
        aiRes?.choices?.[0]?.message?.tool_calls ??
        aiRes?.choices?.[0]?.tool_calls ??
        []

      const hasToolCalls =
        Array.isArray(toolCalls) &&
        toolCalls.length > 0

      if (content !== null) {
        assistantMessage.content =
          content
      }

      if (hasToolCalls) {

        assistantMessage.tool_calls =
          toolCalls.map((t, index) => ({
            id:
              t.id ||
              `call_${index} `,

            type: "function",

            function: {
              name:
                t.name ||
                t.function?.name,

              arguments:
                typeof t.arguments === "string"
                  ? t.arguments
                  : JSON.stringify(
                    t.arguments || {}
                  )
            }
          }))

        assistantMessage.content = null
      }

      if (
        typeof content === "string" &&
        (
          content.includes("<tool_call>") ||
          content.includes("web_search(")
        )
      ) {

        console.warn(
          "BLOCKED TOOL CALL:",
          content
        )

      }

      if (
        assistantMessage.content === undefined &&
        !hasToolCalls
      ) {
        assistantMessage.content =
          JSON.stringify(aiRes)
      }


      // =====================
      // Cost Record
      // =====================

      const estimatedCost =
        estimateCost(
          model,
          length,
          MODELS,
          MODEL_COST
        )

      const updated = {
        cost: Number(
          (
            data.cost +
            estimatedCost
          ).toFixed(6)
        ),
        count:
          data.count + 1
      }

      await env.COST_KV.put(
        today,
        JSON.stringify(updated)
      )

      // =====================
      // Response
      // =====================

      const responsePayload = {
        id:
          "chatcmpl-" +
          crypto.randomUUID(),

        object:
          "chat.completion",

        created:
          Math.floor(
            Date.now() / 1000
          ),

        system_fingerprint:
          "cf-ai-router",

        model:
          requestedModel,

        usage: {
          prompt_tokens:
            aiRes?.usage?.prompt_tokens ?? 0,

          completion_tokens:
            aiRes?.usage?.completion_tokens ?? 0,

          total_tokens:
            aiRes?.usage?.total_tokens ??
            (
              (aiRes?.usage?.prompt_tokens ?? 0) +
              (aiRes?.usage?.completion_tokens ?? 0)
            ),

          request_cost:
            estimatedCost,

          total_cost:
            updated.cost,

          total_requests:
            updated.count
        },

        choices: [
          {
            index: 0,

            message:
              assistantMessage,

            logprobs: null,

            finish_reason:
              hasToolCalls
                ? "tool_calls"
                : "stop"
          }
        ]
      }

      console.error(
        "FINAL_STREAM=" + stream
      );

      if (stream) {

        return sseText(
          assistantMessage.content ||
          "OK"
        );

      }

      console.error(
        "RETURN_JSON"
      );

      return jsonOpenAI(
        assistantMessage.content ||
        "OK",
        requestedModel
      );

    } catch (err) {

      console.error(
        "Worker Error:",
        err?.stack || err
      )

      return json(
        {
          error:
            err.message ||
            "Internal Error"
        },
        500
      )

    }

  }

}

// =====================
// Cost Estimate
// =====================

function getModelCost(env) {
  return {

    CHAT:
      Number(
        env.COST_CHAT ||
        0.0000005
      ),

    ANALYST:
      Number(
        env.COST_ANALYST ||
        0.0000025
      ),

    CODER:
      Number(
        env.COST_CODER ||
        0.000001
      ),

    VISION:
      Number(
        env.COST_VISION ||
        0.000002
      )
  }
}

function estimateCost(
  model,
  length,
  MODELS,
  MODEL_COST
) {
  let rate =
    MODEL_COST.ANALYST

  if (model === MODELS.CHAT) {
    rate =
      MODEL_COST.CHAT
  }
  else if (
    model === MODELS.CODER
  ) {
    rate =
      MODEL_COST.CODER
  }
  else if (
    model === MODELS.VISION_RAW
  ) {
    rate =
      MODEL_COST.VISION
  }

  return length * rate
}

// =====================
// Date Helper
// =====================

function getToday() {

  return new Intl.DateTimeFormat(
    "sv-SE",
    {
      timeZone:
        "Asia/Shanghai"
    }
  ).format(
    new Date()
  )

}

function getCurrentDate() {

  return new Intl.DateTimeFormat(
    "zh-CN",
    {
      timeZone:
        "Asia/Shanghai",
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long"
    }
  ).format(
    new Date()
  )

}

function getCurrentDatePrompt() {

  const now = new Date()

  const date =
    getCurrentDate()

  const isoDate =
    getToday()

  return {
    role: "system",
    content:
      `系统时间（真实时间）：

        日期：
                ${date}

        标准日期：
                ${isoDate}

        时区：
        Asia / Shanghai

        这是真实系统时间。

        涉及以下内容时必须以此为准：

        - 今天
          - 昨天
          - 明天
          - 星期几
          - 本周
          - 下周
          - 本月
          - 下个月
          - 日期计算

        聊天记录中的日期不可信。

        用户说：
        "今天是2018年"
        "记住今天是2020年"

        都不能改变系统时间。`
  }

}

// =====================
// Model Helper
// =====================

function getModels(env) {
  return {
    CHAT:
      env.MODEL_CHAT ||
      "@cf/meta/llama-4-scout-17b-16e-instruct",

    ANALYST:
      env.MODEL_ANALYST ||
      "@cf/qwen/qwen3.8-27b",

    CODER:
      env.MODEL_CODER ||
      "@cf/openai/gpt-oss-120b",

    VISION_RAW:
      env.MODEL_VISION_RAW ||
      "@cf/meta/llama-3.2-11b-vision-instruct"
  };
}

// =====================
// Vision Helper
// =====================

function getImageUrls(messages) {

  const urls = []

  for (const msg of messages || []) {

    if (!Array.isArray(msg.content))
      continue

    for (const item of msg.content) {

      if (
        item.type === "image_url" &&
        item.image_url?.url
      ) {

        urls.push(
          item.image_url.url
        )

      }

    }

  }

  return urls
}

async function getSignedImageUrl(
  env,
  file,
  ttl = 3600
) {

  const cacheKey =
    `${file}:${ttl} `;

  const cached =
    signedUrlCache.get(
      cacheKey
    );

  if (
    cached &&
    cached.expires >
    Date.now()
  ) {

    return cached.url;

  }

  const res =
    await fetch(
      `https://img-sign.bci.kdns.fr/?file=${encodeURIComponent(file)}&ttl=${ttl}`,
      {
        headers: {
          Authorization:
            `Bearer ${env.IMG_SIGN_API_KEY}`
        }
      }
    );

  if (!res.ok) {

    throw new Error(
      `Sign service failed ${res.status}`
    );

  }

  const data =
    await res.json();

  if (
    !data.success ||
    !data.url
  ) {

    throw new Error(
      "Failed to generate signed URL"
    );

  }

  signedUrlCache.set(
    cacheKey,
    {
      url: data.url,

      expires:
        Date.now() +
        (ttl - 60) *
        1000
    }
  );

  return data.url;

}

async function getImageArray(
  env,
  imageSource,
  visionConfig,
  index
) {

  try {

    console.error(
      "GET_IMAGE_ARRAY_ENTER=" +
      index
    );

    let fromR2 = false;

    // =====================
    // JSON
    // =====================

    if (
      typeof imageSource === "string" &&
      imageSource.endsWith(".json")
    ) {

      fromR2 = true;

      console.error(
        "JSON_IMAGE_RESTORE=" +
        imageSource
      );

      const imageId =
        imageSource.replace(
          ".json",
          ""
        );

      const state =
        await getImageState(
          env,
          imageId
        );

      console.error(
        "JSON_IMAGE_FOUND=" +
        !!state
      );

      if (!state) {

        throw new Error(
          `Image state not found: ${imageId}`
        );

      }

      imageSource =
        state.imageSource;

      console.error(
        "JSON_IMAGE_SOURCE_TYPE=" +
        typeof imageSource
      );

      console.error(
        "JSON_IMAGE_SOURCE_PREVIEW=" +
        String(imageSource)
          .slice(0, 100)
      );

    }

    // =====================
    // Uint8Array
    // =====================

    if (
      imageSource instanceof Uint8Array
    ) {

      console.error(
        "IMAGE_SIZE=" +
        imageSource.length
      );

      return {
        imageArray:
          imageSource,
        signedUrl:
          null,
        fromR2
      };

    }

    // =====================
    // Data URI
    // =====================

    if (
      typeof imageSource ===
      "string" &&
      imageSource.startsWith(
        "data:image/"
      )
    ) {

      const base64 =
        imageSource.split(",")[1];

      const binary =
        atob(base64);

      const bytes =
        new Uint8Array(
          binary.length
        );

      for (
        let i = 0;
        i < binary.length;
        i++
      ) {

        bytes[i] =
          binary.charCodeAt(i);

      }

      const digest =
        await crypto.subtle.digest(
          "SHA-256",
          bytes
        );

      const hash =
        [...new Uint8Array(digest)]
          .map(v =>
            v.toString(16)
              .padStart(2, "0")
          )
          .join("");

      console.error(
        "IMAGE_SIZE=" +
        bytes.length
      );

      console.error(
        "IMAGE_SHA256=" +
        hash
      );

      return {
        imageArray:
          bytes,
        signedUrl:
          null,
        fromR2
      };

    }

    // =====================
    // HTTP URL
    // =====================

    if (
      typeof imageSource ===
      "string" &&
      (
        imageSource.startsWith(
          "http://"
        ) ||
        imageSource.startsWith(
          "https://"
        )
      )
    ) {

      fromR2 = true;

      console.error(
        "IMAGE_HTTP_URL=" +
        imageSource
      );

      const response =
        await fetch(
          imageSource
        );

      if (!response.ok) {

        throw new Error(
          `Download failed ${response.status}`
        );

      }

      const buffer =
        await response.arrayBuffer();

      const bytes =
        new Uint8Array(
          buffer
        );

      const digest =
        await crypto.subtle.digest(
          "SHA-256",
          bytes
        );

      const hash =
        [...new Uint8Array(digest)]
          .map(v =>
            v.toString(16)
              .padStart(2, "0")
          )
          .join("");

      console.error(
        "IMAGE_SIZE=" +
        bytes.length
      );

      console.error(
        "IMAGE_SHA256=" +
        hash
      );

      return {
        imageArray:
          bytes,
        signedUrl:
          imageSource,
        fromR2
      };

    }

    // =====================
    // R2 KEY
    // =====================

    fromR2 = true;

    const signedUrl =
      await getSignedImageUrl(
        env,
        imageSource
      );

    console.error(
      "SIGNED_URL=" +
      signedUrl
    );

    const response =
      await fetch(
        signedUrl
      );

    if (!response.ok) {

      throw new Error(
        `Signed URL failed ${response.status}`
      );

    }

    const buffer =
      await response.arrayBuffer();

    const bytes =
      new Uint8Array(
        buffer
      );

    const digest =
      await crypto.subtle.digest(
        "SHA-256",
        bytes
      );

    const hash =
      [...new Uint8Array(digest)]
        .map(v =>
          v.toString(16)
            .padStart(2, "0")
        )
        .join("");

    console.error(
      "IMAGE_SIZE=" +
      bytes.length
    );

    console.error(
      "IMAGE_SHA256=" +
      hash
    );

    return {
      imageArray:
        bytes,
      signedUrl,
      fromR2
    };

  } catch (e) {

    console.error(
      `[IMAGE ${index}] IMAGE LOAD ERROR:`,
      e?.message || e
    );

    return null;

  }

}

function getVisionConfig(
  query,
  MODELS,
  env
) {

  console.error(
    "GET_VISION_CONFIG_FORCE_RAW"
  );

  return {

    type: "raw",

    model:
      MODELS.VISION_RAW,

    schema:
      "vision_raw"

  };

}

async function processSingleImage({
  env,
  imageUrl,
  index,
  effectiveQuery,
  visionConfig,
  visionMaxTokens,
  VISION_PROMPT
}) {

  try {

    console.error(
      "PROCESS_SINGLE_START=" +
      index
    );

    console.error(
      "GET_IMAGE_ARRAY_START",
      {
        index,
        type:
          typeof imageUrl,
        length:
          imageUrl?.length
      }
    );

    const imageData =
      await getImageArray(
        env,
        imageUrl,
        visionConfig,
        index
      );

    if (!imageData) {

      throw new Error(
        "Image load failed"
      );

    }

    const {
      imageArray,
      signedUrl,
      fromR2 = false
    } = imageData;

    if (fromR2) {

      console.error(
        "IMAGE_FROM_R2"
      );

    }

    console.error(
      "GET_IMAGE_ARRAY_RESULT",
      {
        index,
        size:
          imageArray?.length || 0,
        signedUrl,
        fromR2
      }
    );

    const visionRes =
      await analyzeImage(
        env,
        visionConfig,
        imageArray,
        signedUrl,
        effectiveQuery,
        visionMaxTokens,
        VISION_PROMPT
      );

    const text =
      getVisionText(
        visionRes
      );

    console.error(
      "VISION_TEXT_RAW=" +
      JSON.stringify(text)
    );

    return {
      index,
      success: true,
      text,
      fromR2
    };

  } catch (e) {

    console.error(
      "IMAGE_PROCESSING_ERROR",
      {
        index,
        message:
          e?.message,
        stack:
          e?.stack
      }
    );

    return {
      index,
      success: false,
      text:
        `图片分析失败：${e?.message ||
        "unknown error"
        }`,
      fromR2: false
    };

  }

}

async function analyzeImage(
  env,
  visionConfig,
  imageInput,
  signedUrl,
  effectiveQuery,
  visionMaxTokens,
  VISION_PROMPT
) {

  console.error(
    "ANALYZE_CONFIG=" +
    JSON.stringify(visionConfig)
  );

  console.error(
    "ANALYZE_QUERY=" +
    JSON.stringify(effectiveQuery)
  );

  console.error(
    "ANALYZE_IMAGE_ENTER",
    JSON.stringify({
      model:
        visionConfig?.model,
      schema:
        visionConfig?.schema,
      type:
        visionConfig?.type,
      inputType:
        typeof imageInput,
      inputConstructor:
        imageInput?.constructor?.name,
      inputLength:
        imageInput?.length,
      hasSignedUrl:
        !!signedUrl
    })
  );

  try {

    const raw =
      await runVisionModel(
        env,
        visionConfig,
        imageInput,
        signedUrl,
        effectiveQuery,
        VISION_PROMPT,
        visionMaxTokens
      );

    console.error(
      "VISION_RESPONSE_KEYS=" +
      JSON.stringify(
        Object.keys(raw || {})
      )
    );

    const normalized =
      normalizeVisionResponse(
        visionConfig.model,
        raw
      );

    return normalized;

  } catch (e) {

    console.error(
      "VISION_PRIMARY_ERROR=" +
      (e?.message || e)
    );

    const fallbackConfig = {

      type: "raw",

      model:
        env.MODEL_VISION_RAW ||
        "@cf/meta/llama-3.2-11b-vision-instruct",

      schema:
        env.MODEL_VISION_RAW_SCHEMA ||
        "vision_raw"

    };

    const fallbackPrompt =
      effectiveQuery ||
      VISION_PROMPT;

    console.error(
      "FALLBACK_TYPE=" +
      fallbackConfig.type
    );

    console.error(
      "FALLBACK_MODEL=" +
      fallbackConfig.model
    );

    console.error(
      "FALLBACK_PROMPT=" +
      fallbackPrompt
    );

    const raw =
      await runVisionModel(
        env,
        fallbackConfig,
        imageInput,
        signedUrl,
        fallbackPrompt,
        VISION_PROMPT,
        visionMaxTokens
      );

    console.error(
      "FALLBACK_RESPONSE_OK"
    );

    return normalizeVisionResponse(
      fallbackConfig.model,
      raw
    );

  }

}

async function processMultipleImages({
  env,
  imageUrls,
  effectiveQuery,
  visionConfig,
  visionMaxTokens,
  MODELS,
  VISION_PROMPT
}) {

  console.error(
    "PROCESS_MULTI_ENTER",
    imageUrls.length
  );

  const tasks =
    imageUrls.map(
      (imageUrl, index) =>
        processSingleImage({
          env,
          imageUrl,
          index,
          effectiveQuery,
          visionConfig,
          visionMaxTokens,
          VISION_PROMPT
        })
    );

  const results =
    await Promise.all(
      tasks
    );

  const filtered =
    results
      .filter(
        result =>
          result.success &&
          result.text &&
          result.text.trim()
      )
      .sort(
        (a, b) =>
          a.index - b.index
      )
      .map(
        result =>
          result.text
      );

  const fromR2 =
    results.some(
      result =>
        result.fromR2 === true
    );

  console.error(
    "PROCESS_MULTI_FROM_R2=" +
    fromR2
  );

  return {
    filtered,
    fromR2
  };

}

function buildImageFormats(
  image
) {

  console.error(
    "BUILD_IMAGE_FORMATS=" +
    JSON.stringify({
      hasImage: !!image,
      imageType:
        image?.constructor?.name
    })
  );

  if (!image) {
    return [];
  }

  if (
    image instanceof Uint8Array
  ) {

    console.error(
      "BUILD_IMAGE_FORMATS_RESULT=[\"uint8\"]"
    );

    return [
      {
        name: "uint8",
        image
      }
    ];
  }

  if (
    image instanceof ArrayBuffer
  ) {

    const uint8 =
      new Uint8Array(image);

    console.error(
      "BUILD_IMAGE_FORMATS_RESULT=[\"arraybuffer->uint8\"]"
    );

    return [
      {
        name: "arraybuffer",
        image: uint8
      }
    ];
  }

  console.error(
    "BUILD_IMAGE_FORMATS_UNSUPPORTED"
  );

  return [];
}

async function runVisionModel(
  env,
  visionConfig,
  imageInput,
  signedUrl,
  effectiveQuery,
  VISION_PROMPT,
  visionMaxTokens
) {

  console.error(
    "RUN_VISION_INPUT=" +
    JSON.stringify({
      type: typeof imageInput,
      constructor:
        imageInput?.constructor?.name,
      size:
        imageInput?.length,
      hasSignedUrl:
        !!signedUrl
    })
  );

  const prompt =
    effectiveQuery ||
    VISION_PROMPT ||
    "";

  console.error(
    "FINAL_PROMPT=" +
    JSON.stringify(prompt)
  );

  console.error(
    "VISION_CONFIG=" +
    JSON.stringify(visionConfig)
  );

  console.error(
    "USING_RAW_MODEL=" +
    visionConfig.model
  );

  const formats =
    buildImageFormats(
      imageInput
    );

  let lastError = null;

  for (const format of formats) {

    try {

      console.error(
        "RAW_FORMAT_TRY=" +
        format.name
      );

      console.error(
        "RAW_FORMAT_IMAGE_TYPE=" +
        format.image?.constructor?.name
      );

      console.error(
        "AI_RUN_IMAGE_CLASS=" +
        format.image?.constructor?.name
      );

      console.error(
        "AI_RUN_IMAGE_LENGTH=" +
        (
          format.image?.length || 0
        )
      );

      const payload = {
        prompt,
        image: Array.from(format.image),
        max_tokens: visionMaxTokens
      };

      console.error(
        "VISION_PAYLOAD=" +
        JSON.stringify({
          model: visionConfig.model,
          prompt: payload.prompt,
          max_tokens: payload.max_tokens,
          image_length: payload.image.length
        })
      );

      console.error(
        "IMAGE_CLASS=" +
        format.image?.constructor?.name
      );

      console.error(
        "IMAGE_ARRAY_LENGTH=" +
        Array.from(format.image).length
      );

      const raw =
        await env.AI.run(
          visionConfig.model,
          payload
        );

      console.error(
        "RAW_RESPONSE_TYPE=" +
        typeof raw?.response
      );

      console.error(
        "RAW_FORMAT_OK=" +
        format.name
      );

      return raw;

    } catch (e) {

      lastError = e;

      console.error(
        "RAW_FORMAT_FAIL=" +
        format.name +
        " => " +
        (
          e?.message || e
        )
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "All RAW formats failed"
    )
  );
}

function normalizeVisionResponse(
  model,
  raw
) {

  // OpenAI格式直接返回
  if (
    raw?.choices?.[0]?.message
  ) {
    return raw;
  }

  const content =

    raw?.result?.answer ??

    raw?.result?.caption ??

    raw?.result?.response ??

    // 通用格式
    raw?.response ??

    raw?.answer ??

    raw?.description ??

    raw?.content ??

    raw?.text ??

    "";

  return {

    id:
      "chatcmpl-" +
      crypto.randomUUID(),

    object:
      "chat.completion",

    created:
      Math.floor(
        Date.now() / 1000
      ),

    model,

    choices: [
      {
        index: 0,

        finish_reason:
          "stop",

        message: {
          role:
            "assistant",

          content:
            String(content)
        }
      }
    ]
  };

}

function getVisionText(
  visionRes
) {

  let content = "";

  // OpenAI Chat Completion
  if (
    visionRes?.choices?.[0]
      ?.message?.content
  ) {

    content =
      visionRes.choices[0]
        .message.content;

  }

  // Vision result
  else if (
    visionRes?.result?.answer
  ) {

    content =
      visionRes.result.answer;

  }

  else if (
    visionRes?.result?.caption
  ) {

    content =
      visionRes.result.caption;

  }

  // Generic answer
  else if (
    visionRes?.answer
  ) {

    content =
      visionRes.answer;

  }

  // Cloudflare AI response
  else if (
    visionRes?.response
  ) {

    if (
      typeof visionRes.response ===
      "string"
    ) {

      content =
        visionRes.response;

    }

    else if (
      visionRes.response?.text
    ) {

      content =
        visionRes.response.text;

    }

    else {

      content =
        JSON.stringify(
          visionRes.response
        );

    }

  }

  else if (
    visionRes?.description
  ) {

    content =
      visionRes.description;

  }

  else if (
    visionRes?.content
  ) {

    content =
      visionRes.content;

  }

  else if (
    visionRes?.text
  ) {

    content =
      visionRes.text;

  }

  const text =
    String(
      content || ""
    ).trim();

  console.error(
    "GET_VISION_TEXT_LENGTH=" +
    text.length
  );

  if (!text) {

    console.error(
      "GET_VISION_TEXT_EMPTY=" +
      JSON.stringify(
        visionRes
      ).slice(0, 5000)
    );

  }

  return text;

}

async function generateImageId(
  env
) {

  const date =
    getToday()
      .replaceAll("-", "");

  const counterKey =
    `image-counter/${date}.txt`;

  const counterObj =
    await env.IMAGES_BUCKET.get(
      counterKey
    );

  let seq = 1;

  if (counterObj) {

    seq =
      Number(
        await counterObj.text()
      ) + 1;

  }

  await env.IMAGES_BUCKET.put(
    counterKey,
    String(seq)
  );

  return `IMG-${date}-${String(seq).padStart(4, "0")}`;

}

async function saveImageState(
  env,
  imageId,
  imageSource
) {

  if (
    typeof imageSource === "string" &&
    imageSource.endsWith(".json")
  ) {

    console.error(
      "SKIP_SAVE_JSON_SOURCE=" +
      imageSource
    );

    return;
  }

  const key =
    `image-state/${imageId}.json`;

  console.error(
    "SAVE_KEY=" + key
  );

  const state = {
    imageId,
    imageSource,
    created:
      new Date().toISOString()
  };

  await env.IMAGES_BUCKET.put(
    key,
    JSON.stringify(state)
  );

  await env.IMAGES_BUCKET.put(
    "image-state/LAST_IMAGE_ID.txt",
    imageId
  );

  console.error(
    "LAST_IMAGE_ID_SAVED=" +
    imageId
  );
}

async function getImageState(
  env,
  imageId
) {

  if (!imageId) {

    console.error(
      "IMAGE_ID_EMPTY"
    );

    return null;

  }

  const key =
    `image-state/${imageId}.json`;

  console.error(
    "GET_KEY=" + key
  );

  const obj =
    await env.IMAGES_BUCKET.get(
      key
    );

  console.error(
    "GET_EXISTS=" + !!obj
  );

  if (!obj) {

    console.error(
      "IMAGE_STATE_NOT_FOUND"
    );

    return null;

  }

  const state =
    await obj.json();

  console.error(
    "IMAGE_STATE_ID=" +
    state?.imageId
  );

  return state;

}

async function getLastImageState(
  env
) {

  const obj =
    await env.IMAGES_BUCKET.get(
      "image-state/LAST_IMAGE_ID.txt"
    );

  if (!obj) {

    console.error(
      "LAST_IMAGE_ID_NOT_FOUND"
    );

    return null;

  }

  const imageId =
    (await obj.text())
      .trim();

  console.error(
    "LAST_IMAGE_ID=" +
    imageId
  );

  return await getImageState(
    env,
    imageId
  );

}

// =====================
// JSON Helper
// =====================

function json(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":
          "no-store"
      }
    }
  )
}

function jsonOpenAI(
  content,
  model
) {

  return json({

    id:
      "chatcmpl-" +
      crypto.randomUUID(),

    object:
      "chat.completion",

    created:
      Math.floor(Date.now() / 1000),

    model,

    choices: [
      {
        index: 0,

        message: {
          role: "assistant",
          content
        },

        logprobs: null,

        finish_reason: "stop"
      }
    ]

  })

}

// =====================
// Search Helper
// =====================

function shouldSearchKeywords(
  query,
  env
) {

  const patterns =
    getPatterns(
      env.SEARCH_KEYWORDS
    );

  const text =
    String(query || "")
      .toLowerCase();

  const matched =
    patterns.find(
      p => text.includes(p)
    );

  if (!matched) {
    return false;
  }

  return true;

}

async function shouldSearchAI(
  query,
  env
) {

  const models =
    getModels(env);

  const prompt =
    env.SEARCH_AI_PROMPT ||
    "判断用户问题是否需要实时互联网信息。只回答 YES 或 NO。";

  const yesPrefix =
    (
      env.SEARCH_AI_YES_PREFIX ||
      "YES"
    )
      .trim()
      .toUpperCase();

  const r =
    await env.AI.run(
      models.CHEAP,
      {
        messages: [
          {
            role: "system",
            content: prompt
          },
          {
            role: "user",
            content: query
          }
        ]
      }
    );

  const answer =
    String(
      r?.response || ""
    )
      .trim()
      .toUpperCase();

  return answer.startsWith(
    yesPrefix
  );

}

async function shouldSearch(
  query,
  env
) {

  if (
    env.SEARCH_ENABLED !== "true"
  ) {
    return false;
  }

  if (
    !query ||
    !query.trim()
  ) {
    return false;
  }

  query =
    query.trim();

  // =====================
  // Hermes Continue
  // =====================

  if (
    isHermesContinuePrompt(
      query,
      env
    )
  ) {

    return false;

  }

  // =====================
  // Hermes Image Summary
  // =====================

  const hermesImageKeywords =
    (
      env.HERMES_IMAGE_KEYWORDS ||
      ""
    )
      .split("\n")
      .map(v =>
        v.trim().toLowerCase()
      )
      .filter(Boolean);

  const imageHits =
    hermesImageKeywords.filter(
      keyword =>
        query
          .toLowerCase()
          .includes(keyword)
    ).length;

  if (
    imageHits >= 2
  ) {

    return false;

  }

  // =====================
  // 强制搜索
  // =====================

  if (
    shouldSearchKeywords(
      query,
      env
    )
  ) {

    return true;

  }

  // =====================
  // 强制搜索模式
  // =====================

  if (
    shouldForceSearch(
      query,
      env
    )
  ) {

    return true;

  }

  // =====================
  // 强制不搜索
  // =====================

  if (
    shouldSkipSearch(
      query,
      env
    )
  ) {

    return false;

  }

  // =====================
  // AI判断
  // =====================

  try {

    const result =
      await shouldSearchAI(
        query,
        env
      );

    return result;

  } catch (err) {

    console.error(
      "[SEARCH AI]",
      err?.message || err
    );

    return false;

  }

}

function shouldForceSearch(
  query,
  env
) {

  const patterns =
    getPatterns(
      env.SEARCH_FORCE_PATTERNS
    );

  const text =
    String(query || "")
      .toLowerCase();

  const hits =
    patterns.filter(
      p => text.includes(p)
    ).length;

  const threshold =
    Number(
      env.SEARCH_FORCE_THRESHOLD || 1
    );

  return hits >= threshold;

}

function shouldSkipSearch(
  query,
  env
) {

  const patterns =
    getPatterns(
      env.CHAT_PATTERNS
    );

  const text =
    String(query || "")
      .trim()
      .toLowerCase();

  if (!text) {
    return false;
  }

  // 去除结尾标点
  const normalized =
    text.replace(
      /[，,。.!！?？~～]+$/g,
      ""
    );

  return patterns.some(
    p =>
      normalized ===
      String(p)
        .trim()
        .toLowerCase()
  );

}

function getSearchQuery(
  messages
) {

  if (
    !Array.isArray(messages) ||
    !messages.length
  ) {

    return ""

  }

  const lastUserMessage =
    [...messages]
      .reverse()
      .find(
        m => m?.role === "user"
      )

  console.error(
    "LAST_USER_MESSAGE=" +
    JSON.stringify(lastUserMessage)
  );

  if (
    !lastUserMessage
  ) {

    return ""

  }

  const content =
    lastUserMessage.content

  // OpenAI Vision 格式
  if (
    Array.isArray(content)
  ) {

    return content

      .filter(
        item =>
          item?.type === "text"
      )

      .map(
        item =>
          item.text || ""
      )

      .join(" ")

      .trim()

  }

  return String(
    content || ""
  ).trim()

}

function getPatterns(
  value
) {

  return String(
    value || ""
  )
    .split(/[\n\r,，\s]+/)
    .map(v => v.trim())
    .filter(Boolean);

}

function trimMessages(messages, maxChars = 6000) {
  const result = [];
  let total = 0;

  // 倒序检查
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    let len = 0;

    // 极其轻量级的估算，坚决不进行任何深拷贝映射（map）
    if (typeof msg.content === 'string') {
      if (msg.content.startsWith('data:image')) {
        len = 500; // 简写 Base64，直接按固定占位符算
      } else {
        len = msg.content.length; // 纯文本直接取长度，消耗几乎为 0
      }
    } else if (Array.isArray(msg.content)) {
      // 针对多模态标准数组：快查里面有没有超长的 data:image
      let hasLargeImage = false;
      let textLength = 0;

      for (const item of msg.content) {
        if (item.type === 'text' && item.text) {
          textLength += item.text.length;
        } else if (item.type === 'image_url' && item.image_url?.url?.startsWith('data:image')) {
          hasLargeImage = true;
        }
      }
      len = textLength + (hasLargeImage ? 500 : 0) + 50; // 少量空隙补偿
    } else {
      len = 20; // fallback 空白结构
    }

    // 阈值拦截
    if (total + len > maxChars) {
      // 策略：如果是最新的一条用户消息（例如刚发的图），无论多长都强行保留，否则大模型会因收不到最新请求而卡死
      if (result.length === 0) {
        result.unshift(msg);
      }
      break; // 其余历史消息果断丢弃，终止循环节约 CPU 时间
    }

    total += len;
    result.unshift(msg);
  }

  return result;
}

async function searchWebJson(
  query,
  env
) {
  const normalizedQuery =
    normalizeSearchQuery(query);

  const MAX_RETRIES = 3;
  const TIMEOUT_MS =
    Number(
      env.SEARCH_TIMEOUT_MS || 5000
    );

  let lastError = null;

  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        TIMEOUT_MS
      );

    try {

      console.error(
        `[SERPER_START] query="${normalizedQuery}" attempt=${attempt}`
      );

      const resp = await fetch(
        "https://google.serper.dev/search",
        {
          method: "POST",
          headers: {
            "X-API-KEY":
              env.SP_API_KEY,
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            q: normalizedQuery
          }),
          signal:
            controller.signal
        }
      );

      clearTimeout(timeout);

      console.error(
        `[SERPER_STATUS] ${resp.status}`
      );

      if (!resp.ok) {
        throw new Error(
          `HTTP_${resp.status}`
        );
      }

      const data =
        await resp.json();

      const organic =
        Array.isArray(
          data?.organic
        )
          ? data.organic
          : [];

      const results =
        organic.map(item => ({
          url:
            item?.link || "",
          title:
            item?.title || "",
          content:
            item?.snippet || "",
          publishedDate:
            item?.date || ""
        }));

      const seen =
        new Set();

      const filtered =
        results.filter(item => {

          const url =
            item.url?.trim();

          if (!url) {
            return false;
          }

          if (
            seen.has(url)
          ) {
            return false;
          }

          seen.add(url);

          return true;
        });

      console.error(
        `SERPER_RESULTS=${filtered.length}`
      );

      return filtered;

    } catch (e) {

      clearTimeout(timeout);

      lastError =
        e?.message ||
        String(e);

      console.error(
        `[SERPER_FAIL] attempt=${attempt} reason=${lastError}`
      );

      if (
        attempt <
        MAX_RETRIES
      ) {

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              200
            )
        );

      }

    }

  }

  console.error(
    `[SERPER_FATAL] ${lastError}`
  );

  return [];
}

async function searchWeb(
  query,
  env
) {

  const normalizedQuery =
    normalizeSearchQuery(
      query
    );

  console.error(
    `SEARCH_QUERY=${normalizedQuery}`
  );

  try {

    const results =
      await searchWebJson(
        normalizedQuery,
        env
      );

    if (
      !Array.isArray(results) ||
      results.length === 0
    ) {

      console.error(
        "SEARCH_EMPTY"
      );

      return {
        context: "",
        results: []
      };

    }

    const rankedResults =
      rankSearchResults(
        results,
        normalizedQuery
      );

    console.error(
      "RANKED_RESULTS=" +
      rankedResults.length
    );

    const maxResults =
      Math.min(
        Number(
          env.SEARCH_MAX_RESULTS || 5
        ),
        10
      );

    const context =
      rankedResults
        .slice(
          0,
          maxResults
        )
        .map(
          (
            r,
            index
          ) =>

            `[${index + 1}]

Title:
${(r.title || "")
              .replace(/\s+/g, " ")
              .slice(0, 200)}

Snippet:
${(r.content || "")
              .replace(/\s+/g, " ")
              .slice(0, 500)}

URL:
${r.url || ""}

Date:
${r.publishedDate || ""}`
        )
        .join("\n\n");

    const finalContext =
      context.length > 3000
        ? context.slice(
          0,
          3000
        )
        : context;

    console.error(
      "SEARCH_CONTEXT_LENGTH=" +
      finalContext.length
    );

    return {
      context:
        finalContext,
      results:
        rankedResults
    };

  } catch (e) {

    console.error(
      "SEARCH_ERROR=" +
      (
        e?.stack ||
        e?.message ||
        e
      )
    );

    return {
      context: "",
      results: []
    };

  }

}

function formatNewsResults(
  results
) {

  return results
    .slice(0, 5)
    .map(
      (r, i) =>

        `${i + 1}. ${r.title}

来源：
${r.url}

摘要：
${r.content || r.snippet || "无"}
`
    )
    .join("\n\n")

}

function rankSearchResults(
  results,
  query
) {

  const q =
    String(query || "")
      .toLowerCase()
      .trim()

  const keywords = [
    ...(q.match(/[a-z0-9]+/gi) || []),
    ...(q.match(/[\u4e00-\u9fa5]{2,}/g) || [])
  ].filter(Boolean)

  const isNewsQuery =
    /新闻|报道|消息|动态|最新|最近|本周|一周|news/i
      .test(q)

  const isFinanceQuery =
    /财报|业绩|盈利|利润|营收|收入|earnings|revenue|guidance|forecast|stock|股票|股价|分析师|评级|investor|ipo/i
      .test(q)

  function containsKeyword(
    text,
    keyword
  ) {

    if (!text || !keyword)
      return false

    if (
      /[\u4e00-\u9fa5]/.test(
        keyword
      )
    ) {
      return text.includes(
        keyword
      )
    }

    const escaped =
      keyword.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )

    return new RegExp(
      `\\b${escaped}\\b`,
      "i"
    ).test(text)

  }

  function scoreResult(r) {

    const title =
      (r.title || "")
        .toLowerCase()

    const content =
      (
        r.content ||
        r.snippet ||
        ""
      )
        .toLowerCase()

    const url =
      (r.url || "")
        .toLowerCase()

    let hostname = ""
    let pathname = ""

    try {

      const u =
        new URL(
          r.url || ""
        )

      hostname =
        u.hostname
          .toLowerCase()

      pathname =
        u.pathname
          .toLowerCase()

    } catch { }

    let score = 0

    // =====================
    // 标题相关性
    // =====================

    for (const keyword of keywords) {

      if (
        containsKeyword(
          title,
          keyword
        )
      ) {
        score += 120
      }

      if (
        url.includes(
          keyword
        )
      ) {
        score += 50
      }

      if (
        containsKeyword(
          content,
          keyword
        )
      ) {
        score += 20
      }

    }

    // =====================
    // 主体域名匹配
    // =====================

    let hostnameMatched =
      false

    for (const keyword of keywords) {

      if (
        keyword.length < 3
      ) continue

      if (
        hostname.includes(
          keyword
        )
      ) {

        score += 200
        hostnameMatched = true

      }

    }

    // =====================
    // 标题命中但域名不匹配
    // =====================

    const titleMatched =
      keywords.some(
        k =>
          containsKeyword(
            title,
            k
          )
      )

    if (
      titleMatched &&
      !hostnameMatched
    ) {

      score -= 40

    }

    // =====================
    // 新闻文章页
    // =====================

    if (
      /\/news\//i.test(
        pathname
      )
    ) {
      score += 250
    }

    if (
      /\/article\//i.test(
        pathname
      )
    ) {
      score += 250
    }

    if (
      /\/story\//i.test(
        pathname
      )
    ) {
      score += 220
    }

    if (
      /\/press-release\//i.test(
        pathname
      )
    ) {
      score += 220
    }

    // =====================
    // URL深度
    // =====================

    const depth =
      pathname
        .split("/")
        .filter(Boolean)
        .length

    score += Math.min(
      depth * 25,
      150
    )

    // =====================
    // 发布时间
    // =====================

    if (
      r.publishedDate
    ) {

      const ts =
        Date.parse(
          r.publishedDate
        )

      if (
        !isNaN(ts)
      ) {

        const ageDays =
          (
            Date.now() - ts
          ) /
          86400000

        if (ageDays <= 7) {
          score += 150
        }
        else if (ageDays <= 30) {
          score += 100
        }
        else if (ageDays <= 90) {
          score += 60
        }
        else if (ageDays <= 365) {
          score += 20
        }

      }

    }

    // =====================
    // Newsroom
    // =====================

    if (
      hostname.includes(
        "newsroom"
      )
    ) {
      score += 120
    }

    if (
      hostname.startsWith(
        "news."
      )
    ) {
      score += 100
    }

    if (
      hostname.startsWith(
        "blog."
      )
    ) {
      score += 80
    }

    // =====================
    // 财经查询增强
    // =====================

    if (
      isFinanceQuery
    ) {

      if (

        /earnings|revenue|guidance|results|quarter|financial|investor/i
          .test(title)

      ) {

        score += 300

      }

      if (

        /financial-results|quarter-results|earnings/i
          .test(url)

      ) {

        score += 250

      }

      if (

        hostname.includes(
          "investor"
        )

      ) {

        score += 300

      }

      if (

        hostname.includes(
          "ir."
        )

      ) {

        score += 250

      }

      if (

        hostname.includes(
          "sec.gov"
        )

      ) {

        score += 300

      }

    }

    // =====================
    // 普通新闻时压低财报
    // =====================

    if (
      isNewsQuery &&
      !isFinanceQuery
    ) {

      if (

        /earnings|financial results|quarterly results|revenue|investor|stock|share price|ipo/i
          .test(title)

      ) {

        score -= 250

      }

    }

    // =====================
    // 财经媒体
    // =====================

    if (
      hostname.includes(
        "reuters"
      )
    ) score += 40

    if (
      hostname.includes(
        "bloomberg"
      )
    ) score += 40

    if (
      hostname.includes(
        "marketwatch"
      )
    ) score += 40

    if (
      hostname.includes(
        "investing"
      )
    ) score += 40

    if (
      hostname.includes(
        "wsj"
      )
    ) score += 40

    // =====================
    // 新闻首页
    // =====================

    if (
      pathname === "/" ||
      pathname === ""
    ) {

      score -= 250

    }

    // =====================
    // 新闻栏目页
    // =====================

    if (

      /\/news$|\/newsroom$|\/latest-news$|\/all-news$/i
        .test(pathname)

    ) {

      score -= 180

    }

    // =====================
    // 门户首页
    // =====================

    if (

      /stock market live|finance news|quote & history/i
        .test(title)

    ) {

      score -= 300

    }

    return score

  }

  const ranked =
    [...results]
      .sort(
        (a, b) =>
          scoreResult(b) -
          scoreResult(a)
      )

  ranked
    .slice(0, 10)
    .forEach(
      (r, i) => {

      }
    )

  return ranked

}

// =====================
// Normalize Helper
// =====================

function normalizeMessages(messages) {

  return messages.map(msg => {

    // 纯文本
    if (typeof msg.content === "string") {
      return msg;
    }

    // 多模态直接保留
    if (Array.isArray(msg.content)) {
      return {
        role: msg.role,
        content: msg.content
      };
    }

    return {
      role: msg.role,
      content: String(msg.content || "")
    };

  });

}

function normalizeSearchQuery(
  query
) {

  return String(query || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[，。！？、]/g, "")

}

function normalizeCompanyName(
  company
) {

  return company
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "")
}

// =====================
// SSE Helper
// =====================

function sseText(content) {

  const id =
    "chatcmpl-" +
    crypto.randomUUID();

  const chunk1 = {
    id,
    object: "chat.completion.chunk",
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          content
        },
        finish_reason: null
      }
    ]
  };

  const chunk2 = {
    id,
    object: "chat.completion.chunk",
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: "stop"
      }
    ]
  };

  const body =
    `data: ${JSON.stringify(chunk1)}\n\n` +
    `data: ${JSON.stringify(chunk2)}\n\n` +
    `data: [DONE]\n\n`;

  return new Response(body, {
    headers: {
      "Content-Type":
        "text/event-stream; charset=utf-8",
      "Cache-Control":
        "no-cache",
      "Connection":
        "keep-alive"
    }
  });

}

function extractMessageText(
  message
) {

  if (!message) {
    return "";
  }

  if (
    typeof message.content ===
    "string"
  ) {
    return message.content;
  }

  if (
    Array.isArray(
      message.content
    )
  ) {

    return message.content
      .filter(
        item =>
          item.type === "text"
      )
      .map(
        item =>
          item.text || ""
      )
      .join("\n");

  }

  return "";

}

// =====================
// Cache Helper
// =====================

async function cacheGet(
  env,
  key
) {

  try {

    const data =
      await env.SYMBOL_CACHE.get(
        key
      )

    if (!data) {
      return null
    }

    return JSON.parse(data)

  } catch (e) {

    console.error(
      "CACHE GET ERROR:",
      key,
      e
    )

    return null

  }

}

async function cachePut(
  env,
  key,
  value,
  ttl
) {

  try {

    await env.SYMBOL_CACHE.put(
      key,
      JSON.stringify(value),
      {
        expirationTtl: ttl
      }
    )

  } catch (e) {

    console.error(
      "CACHE PUT ERROR:",
      key,
      e
    )

  }

}

// =====================
// Stock Service
// =====================

function looksLikeStockLookup(
  query
) {

  query =
    String(query || "")
      .trim();

  if (!query) {
    return false;
  }

  const words =
    query
      .split(/\s+/)
      .filter(Boolean);

  return (
    words.length <= 3 &&
    query.length <= 40
  );

}

async function getStockPrice(
  symbol,
  env
) {

  console.error(
    "QUOTE_SYMBOL=" +
    symbol
  )

  const cacheKey =
    `quote:${symbol}`

  // =====================
  // Cache Read
  // =====================

  try {

    const cache =
      await cacheGet(
        env,
        cacheKey
      )

    if (cache) {

      console.error(
        "QUOTE_CACHE_HIT=" +
        symbol
      )

      return cache

    }

  } catch (e) {

    console.error(
      "CACHE_READ_ERROR=" +
      (
        e?.message || e
      )
    )

  }

  const url =
    `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${env.TW_API_KEY}`

  console.error(
    "QUOTE_URL=" +
    url
  )

  const resp =
    await fetch(url)

  console.error(
    "QUOTE_STATUS=" +
    resp.status
  )

  // =====================
  // HTTP ERROR
  // =====================

  if (!resp.ok) {

    console.error(
      "QUOTE_HTTP_ERROR=" +
      resp.status
    )

    if (
      resp.status === 404 &&
      /\.(SH|SZ|HK)$/i.test(
        symbol
      )
    ) {

      console.error(
        "CN_MARKET_NOT_SUPPORTED=" +
        symbol
      )

      return {

        symbol,

        codeOnly: true,

        unsupported: true,

        message:
          `已识别股票代码：${symbol}\n当前行情网站（TwelveData）不支持中国大陆或香港市场股票查询。`

      }

    }

    if (
      resp.status === 429
    ) {

      return {

        error:
          "RATE_LIMIT"

      }

    }

    return null

  }

  const raw =
    await resp.json()

  console.error(
    "TWELVEDATA_RAW=" +
    JSON.stringify(raw)
  )

  // =====================
  // API ERROR
  // =====================

  if (
    raw.status === "error"
  ) {

    console.error(
      "TWELVEDATA_ERROR=" +
      JSON.stringify(raw)
    )

    if (
      /\.(SH|SZ|HK)$/i.test(
        symbol
      )
    ) {

      return {

        symbol,

        codeOnly: true,

        unsupported: true,

        message:
          `已识别股票代码：${symbol}\n当前行情网站（TwelveData）不支持中国大陆或香港市场股票查询。`

      }

    }

    return null

  }

  // =====================
  // Quote Data
  // =====================

  const quote = {

    symbol,

    c: Number(
      raw.close
    ),

    d: Number(
      raw.change
    ),

    dp: Number(
      raw.percent_change
    ),

    h: Number(
      raw.high
    ),

    l: Number(
      raw.low
    ),

    o: Number(
      raw.open
    ),

    pc: Number(
      raw.previous_close
    ),

    t:
      (
        raw.timestamp ||
        Date.now() / 1000
      ) * 1000

  }

  console.error(
    "QUOTE_DATA=" +
    JSON.stringify(
      quote
    )
  )

  // =====================
  // Cache Write
  // =====================

  try {

    await cachePut(
      env,
      cacheKey,
      quote,
      60
    )

    console.error(
      "QUOTE_CACHE_WRITE=" +
      symbol
    )

  } catch (e) {

    console.error(
      "CACHE_WRITE_ERROR=" +
      (
        e?.message || e
      )
    )

  }

  console.error(
    "QUOTE_SUCCESS=" +
    symbol
  )

  return quote

}

async function searchSymbolFromWeb(
  company,
  env
) {

  try {

    const results =
      await searchWebJson(
        `${company} stock ticker symbol NASDAQ NYSE`,
        env
      );

    console.error(
      "WEB_RESULTS=" +
      JSON.stringify(results)
    );

    const candidates = [];

    let blacklist =
      new Set();

    try {

      blacklist =
        new Set(
          JSON.parse(
            env.STOCK_SYMBOL_BLACKLIST ||
            "[]"
          )
        );

    } catch (e) {

      console.error(
        "BLACKLIST_PARSE_ERROR=" +
        (e?.message || e)
      );

    }

    const addCandidate = (
      symbol,
      score
    ) => {

      symbol =
        String(symbol || "")
          .trim()
          .toUpperCase();

      // 长度限制

      if (
        symbol.length < 2 ||
        symbol.length > 5
      ) {
        return;
      }

      // 只允许纯字母

      if (
        !/^[A-Z]+$/.test(
          symbol
        )
      ) {
        return;
      }

      // 环境变量黑名单

      if (
        blacklist.has(
          symbol
        )
      ) {
        return;
      }

      candidates.push({
        symbol,
        score
      });

    };

    for (
      const item of results || []
    ) {

      const text =
        [
          item.title,
          item.content,
          item.url
        ]
          .filter(Boolean)
          .join("\n");

      // 300
      // NASDAQ:AAPL

      for (
        const match of text.matchAll(
          /\b(?:NASDAQ|NYSE|AMEX)\s*:\s*([A-Z]{2,5})\b/gi
        )
      ) {

        addCandidate(
          match[1],
          300
        );

      }

      // 295
      // AAPL (NASDAQ)

      for (
        const match of text.matchAll(
          /\b([A-Z]{2,5})\s*\((?:NASDAQ|NYSE|AMEX)\)/gi
        )
      ) {

        addCandidate(
          match[1],
          295
        );

      }

      // 290
      // (AAPL)

      for (
        const match of text.matchAll(
          /\(([A-Z]{2,5})\)/g
        )
      ) {

        addCandidate(
          match[1],
          290
        );

      }

      // 280
      // ticker AAPL

      for (
        const match of text.matchAll(
          /\bticker\s*:?\s*([A-Z]{2,5})\b/gi
        )
      ) {

        addCandidate(
          match[1],
          280
        );

      }

      // 270
      // AAPL ticker

      for (
        const match of text.matchAll(
          /\b([A-Z]{2,5})\s+ticker\b/gi
        )
      ) {

        addCandidate(
          match[1],
          270
        );

      }

      // 260
      // symbol AAPL
      // symbol is AAPL

      for (
        const match of text.matchAll(
          /\bsymbol\s+(?:is\s+)?([A-Z]{2,5})\b/gi
        )
      ) {

        addCandidate(
          match[1],
          260
        );

      }

    }

    // 去重 + 统计出现次数

    const unique = {};

    for (
      const item of candidates
    ) {

      if (
        !unique[
        item.symbol
        ]
      ) {

        unique[
          item.symbol
        ] = {

          symbol:
            item.symbol,

          score:
            item.score,

          count: 1

        };

      } else {

        unique[
          item.symbol
        ].score =
          Math.max(
            unique[
              item.symbol
            ].score,
            item.score
          );

        unique[
          item.symbol
        ].count++;

      }

    }

    const finalList =
      Object.values(
        unique
      ).sort(
        (a, b) =>

          b.count -
          a.count ||

          b.score -
          a.score
      );

    console.error(
      "WEB_CANDIDATES=" +
      JSON.stringify(
        finalList
      )
    );

    return finalList;

  } catch (e) {

    console.error(
      "SYMBOL_WEB_ERROR=" +
      (
        e?.stack ||
        e?.message ||
        e
      )
    );

    return [];

  }

}

async function validateSymbolCompany(
  symbol,
  company,
  env
) {

  try {

    const url =
      "https://api.twelvedata.com/quote" +
      `?symbol=${encodeURIComponent(symbol)}` +
      `&apikey=${env.TW_API_KEY}`;

    const resp =
      await fetch(url);

    // =====================
    // CN/HK 不验证
    // =====================

    if (!resp.ok) {

      if (
        /\.(SH|SZ|HK)$/i.test(
          symbol
        )
      ) {

        console.error(
          "SKIP_VALIDATE_CN_SYMBOL=" +
          symbol
        );

        return true;

      }

      return false;

    }

    const data =
      await resp.json();

    const name =
      String(
        data.name ||
        data.symbol ||
        ""
      )
        .toUpperCase()
        .trim();

    const target =
      String(company || "")
        .toUpperCase()
        .trim();

    console.error(
      `VALIDATE_SYMBOL=${symbol}`
    );

    console.error(
      `VALIDATE_NAME=${name}`
    );

    console.error(
      `VALIDATE_TARGET=${target}`
    );

    if (name === target) {
      return true;
    }

    if (
      name.includes(target) ||
      target.includes(name)
    ) {
      return true;
    }

    const targetWords =
      target
        .split(/[\s\-_.]+/)
        .filter(Boolean);

    const hitCount =
      targetWords.filter(
        word =>
          word.length >= 3 &&
          name.includes(word)
      ).length;

    return (
      hitCount > 0 &&
      hitCount >=
      Math.ceil(
        targetWords.length / 2
      )
    );

  } catch (e) {

    console.error(
      "VALIDATE_ERROR=" +
      (
        e?.message || e
      )
    );

    return false;

  }

}

async function getStockHistory(
  symbol,
  env
) {

  const cacheKey =
    `history:${symbol}`;

  const cached =
    await cacheGet(
      env,
      cacheKey
    );

  if (cached) {

    return cached;

  }

  try {

    const url =
      "https://api.twelvedata.com/time_series" +
      `?symbol=${encodeURIComponent(symbol)}` +
      "&interval=1day" +
      "&outputsize=14" +
      `&apikey=${env.TW_API_KEY}`;

    const resp =
      await fetch(url);

    if (!resp.ok) {

      // CN/HK 特殊处理

      if (
        /\.(SH|SZ|HK)$/i.test(
          symbol
        )
      ) {

        console.error(
          "CN_HISTORY_NOT_SUPPORTED=" +
          symbol
        );

        return {

          unsupported: true,

          symbol,

          message:
            `已识别股票代码：${symbol}\n当前行情网站（TwelveData）不支持中国大陆或香港市场历史数据查询。`

        };

      }

      return null;

    }

    const raw =
      await resp.json();

    if (
      raw.status === "error"
    ) {

      console.error(
        "TWELVE_DATA_ERROR=" +
        JSON.stringify(raw)
      );

      if (
        /\.(SH|SZ|HK)$/i.test(
          symbol
        )
      ) {

        return {

          unsupported: true,

          symbol,

          message:
            `已识别股票代码：${symbol}\n当前行情网站（TwelveData）不支持中国大陆或香港市场历史数据查询。`

        };

      }

      return null;

    }

    const history = {

      c: [],
      h: [],
      l: [],
      o: [],
      t: [],
      v: [],
      s: "ok"

    };

    const values =
      raw.values || [];

    for (
      const row of values.reverse()
    ) {

      history.c.push(
        Number(row.close)
      );

      history.h.push(
        Number(row.high)
      );

      history.l.push(
        Number(row.low)
      );

      history.o.push(
        Number(row.open)
      );

      history.v.push(
        Number(
          row.volume || 0
        )
      );

      history.t.push(
        Math.floor(
          new Date(
            row.datetime
          ).getTime() / 1000
        )
      );

    }

    await cachePut(
      env,
      cacheKey,
      history,
      3600
    );

    return history;

  } catch (e) {

    console.error(
      "HISTORY_ERROR=" +
      (
        e?.message || e
      )
    );

    return null;

  }

}

function cleanStockQuery(
  query,
  env
) {

  if (!query) {
    return ""
  }

  // 查询关键词
  const stockKeywords =
    (env.STOCK_KEYWORDS || "")
      .split(",")
      .map(v => v.trim())
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.length - a.length
      )

  // 市场关键词
  const marketKeywords =
    (env.STOCK_MARKET_KEYWORDS || "")
      .split(",")
      .map(v => v.trim())
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.length - a.length
      )

  // 先删尾部查询词
  for (const keyword of stockKeywords) {

    if (
      query.endsWith(
        keyword
      )
    ) {

      query =
        query.slice(
          0,
          -keyword.length
        )

      break

    }

  }

  // 兼容：
  // 茅台股
  // 腾讯股
  // 苹果股
  query =
    query.replace(
      /股$/i,
      ""
    )

  // 再删市场词
  for (const keyword of marketKeywords) {

    query =
      query.replaceAll(
        keyword,
        ""
      )

  }

  // 保留代码后缀
  query =
    query.replace(
      /[^A-Za-z0-9\u4e00-\u9fa5.]/g,
      ""
    )

  return query.trim()

}

async function searchSymbol(
  query,
  env
) {

  console.error(
    "SEARCH_SYMBOL_QUERY=" +
    query
  );

  const keyword =
    cleanStockQuery(
      query,
      env
    ).trim();

  console.error(
    "SEARCH_SYMBOL_KEYWORD=" +
    keyword
  );

  if (!keyword) {

    return null;

  }

  const upper =
    keyword.toUpperCase();

  // =====================
  // Load Alias
  // =====================

  let aliases = {};

  try {

    aliases = {

      ...(JSON.parse(
        env.CN_HK_STOCK_ALIASES ||
        "{}"
      )),

      ...(JSON.parse(
        env.US_STOCK_ALIASES ||
        "{}"
      )),

      ...(JSON.parse(
        env.DE_STOCK_ALIASES ||
        "{}"
      ))

    };

  } catch (e) {

    console.error(
      "ALIAS_PARSE_ERROR=" +
      (
        e?.message || e
      )
    );

  }

  // =====================
  // Alias Match
  // =====================

  const aliasSymbol =

    aliases[keyword] ||

    aliases[upper] ||

    aliases[
    keyword.toLowerCase()
    ];

  if (aliasSymbol) {

    console.error(
      `SYMBOL_ALIAS=${keyword} -> ${aliasSymbol}`
    );

    return aliasSymbol;

  }

  // =====================
  // A股代码
  // =====================

  if (
    /^\d{6}$/.test(
      keyword
    )
  ) {

    const symbol =

      keyword.startsWith(
        "6"
      )

        ? `${keyword}.SH`

        : `${keyword}.SZ`;

    console.error(
      "AUTO_CN_SYMBOL=" +
      symbol
    );

    return symbol;

  }

  // =====================
  // 港股代码
  // =====================

  if (
    /^\d{4,5}$/.test(
      keyword
    )
  ) {

    const symbol =
      keyword.padStart(
        4,
        "0"
      ) + ".HK";

    console.error(
      "AUTO_HK_SYMBOL=" +
      symbol
    );

    return symbol;

  }

  // =====================
  // 直接股票代码
  // =====================

  if (
    /^[A-Za-z]{1,5}$/.test(keyword)
  ) {
    console.error(
      "DIRECT_US_SYMBOL=" +
      upper
    );

    return upper;
  }

  // =====================
  // 中文公司名
  // 不允许Web搜索
  // =====================

  const isChinese =
    /[\u4e00-\u9fa5]/.test(
      keyword
    );

  if (
    isChinese &&
    !/[A-Za-z]/.test(
      keyword
    )
  ) {

    console.error(
      "SKIP_WEB_SYMBOL_SEARCH_CHINESE"
    );

    return null;

  }

  // =====================
  // 英文公司名
  // 允许Web搜索
  // =====================

  const candidates =
    await searchSymbolFromWeb(
      keyword,
      env
    );

  console.error(
    "SEARCH_SYMBOL_RESULTS=" +
    candidates.length
  );

  if (
    candidates.length >
    0
  ) {

    console.error(
      "SEARCH_SYMBOL_RESULT=" +
      candidates[0]
        .symbol
    );

    return candidates[0]
      .symbol;

  }

  console.error(
    "SEARCH_SYMBOL_RESULT=null"
  );

  return null;

}

// =====================
// Other Services
// =====================

async function getExchangeRate(
  from,
  to,
  env
) {

  const cacheKey =
    `fx:${from}:${to}`

  try {

    const cached =
      await env.SYMBOL_CACHE.get(
        cacheKey
      )

    if (cached) {

      return JSON.parse(
        cached
      )

    }

  } catch (e) {

    console.error(
      "FX CACHE READ ERROR:",
      e
    )

  }

  const currencyMap =
    JSON.parse(
      env.FX_CURRENCIES || "{}"
    )

  const allCurrencies =
    Object.values(
      currencyMap
    )

  const currencies =

    to === "*"
      ? allCurrencies.join(",")
      : to

  const url =
    `https://api.exchangerate.host/live?source=${from}&currencies=${currencies}&access_key=${env.EXCHANGERATE_API_KEY}`

  const resp =
    await fetch(url)

  if (!resp.ok) {

    return null

  }

  const data =
    await resp.json()

  // =====================
  // 返回全部汇率
  // =====================

  if (
    to === "*"
  ) {

    const rates = {}

    for (
      const code of allCurrencies
    ) {

      if (
        code === from
      ) {

        rates[code] = 1
        continue

      }

      const pair =
        `${from}${code}`

      if (
        data?.quotes?.[
        pair
        ]
      ) {

        rates[code] =
          data.quotes[pair]

      }

    }

    try {

      await env.SYMBOL_CACHE.put(
        cacheKey,
        JSON.stringify(
          rates
        ),
        {
          expirationTtl: 600
        }
      )

    } catch (e) {

      console.error(
        "FX CACHE WRITE ERROR:",
        e
      )

    }

    return rates

  }

  // =====================
  // 返回单个汇率
  // =====================

  const rate =
    data?.quotes?.[
    `${from}${to}`
    ]

  if (
    rate === null ||
    rate === undefined
  ) {

    return null

  }

  try {

    await env.SYMBOL_CACHE.put(
      cacheKey,
      JSON.stringify(
        rate
      ),
      {
        expirationTtl: 600
      }
    )

  } catch (e) {

    console.error(
      "FX CACHE WRITE ERROR:",
      e
    )

  }

  return rate

}

async function getCryptoPrice(
  symbol,
  env
) {

  const cacheKey =
    `crypto:${symbol}`

  try {

    const cached =
      await env.SYMBOL_CACHE.get(
        cacheKey
      )

    if (cached) {

      return cached

    }

  } catch (e) {

    console.error(
      "CRYPTO CACHE READ ERROR:",
      e
    )

  }

  try {

    const url =
      `https://www.okx.com/api/v5/market/ticker?instId=${symbol}-USDT`

    const resp =
      await fetch(url)

    if (!resp.ok) {

      const text =
        await resp.text()

      return null

    }

    const data =
      await resp.json()

    const price =
      data?.data?.[0]?.last ||
      null

    if (!price) {

      return null

    }

    try {

      await env.SYMBOL_CACHE.put(
        cacheKey,
        price,
        {
          expirationTtl: 300
        }
      )

    } catch (e) {

      console.error(
        "CRYPTO CACHE WRITE ERROR:",
        e
      )

    }

    return price

  } catch (e) {

    console.error(
      "CRYPTO FETCH ERROR:",
      e
    )

    return null

  }

}

async function getWeather(
  city,
  env
) {

  const cacheKey =
    `weather:${city
      .toLowerCase()
      .trim()}`

  try {

    const cached =
      await env.SYMBOL_CACHE.get(
        cacheKey
      )

    if (cached) {

      return JSON.parse(
        cached
      )

    }

  } catch (e) {

    console.error(
      "WEATHER CACHE READ ERROR:",
      e
    )

  }

  const geoResp =
    await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        city
      )}&format=jsonv2&limit=1`,
      {
        headers: {
          "User-Agent":
            "WeatherBot/1.0"
        }
      }
    )

  const geo =
    await geoResp.json()

  if (!geo?.length) {

    return null

  }

  const lat =
    geo[0].lat

  const lon =
    geo[0].lon

  const locationName =
    geo[0].display_name

  const resp =
    await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${env.OPENWEATHER_API_KEY}&units=metric&lang=zh_cn`
    )

  if (!resp.ok) {

    const text =
      await resp.text()

    return null

  }

  const data =
    await resp.json()

  data.locationName =
    locationName

  data.latitude =
    lat

  data.longitude =
    lon

  try {

    await env.SYMBOL_CACHE.put(
      cacheKey,
      JSON.stringify(
        data
      ),
      {
        expirationTtl:
          600
      }
    )

  } catch (e) {

    console.error(
      "WEATHER CACHE WRITE ERROR:",
      e
    )

  }

  return data

}

function extractCity(
  query
) {

  return query

    .replace(
      /天气预报/g,
      ""
    )

    .replace(
      /天气|气候|气温|温度|下雨|预报/g,
      ""
    )

    .replace(
      /\s+/g,
      ""
    )

    .trim()

}

// =====================
// Service Handler
// =====================

async function handleWeather(
  query,
  env,
  stream,
  requestedModel
) {

  const city =
    extractCity(query)

  if (!city) {

    const result =
      "未识别到城市名称"

    if (stream) {
      return sseText(result)
    }

    return jsonOpenAI(
      result,
      requestedModel
    )

  }

  const weather =
    await getWeather(
      city,
      env
    )

  if (!weather) {

    const result =
      `${city}天气信息获取失败`

    if (stream) {
      return sseText(result)
    }

    return jsonOpenAI(
      result,
      requestedModel
    )

  }

  const sunrise =
    new Date(
      weather.sys?.sunrise * 1000
    ).toLocaleTimeString(
      "zh-CN",
      {
        timeZone:
          "Asia/Shanghai",
        hour: "2-digit",
        minute: "2-digit"
      }
    )

  const sunset =
    new Date(
      weather.sys?.sunset * 1000
    ).toLocaleTimeString(
      "zh-CN",
      {
        timeZone:
          "Asia/Shanghai",
        hour: "2-digit",
        minute: "2-digit"
      }
    )

  const result =
    `${city}天气

位置：
${weather.locationName}

经纬度：
${weather.latitude},
${weather.longitude}

天气：
${weather.weather?.[0]?.description}

当前温度：
${weather.main?.temp}°C

体感温度：
${weather.main?.feels_like}°C

湿度：
${weather.main?.humidity}%

风速：
${weather.wind?.speed} m/s

日出：
${sunrise}

日落：
${sunset}`

  if (stream) {

    return sseText(
      result
    )

  }

  return jsonOpenAI(
    result,
    requestedModel
  )

}

async function handleExchangeRate(
  query,
  env,
  stream,
  requestedModel
) {

  const currencyMap =
    JSON.parse(
      env.FX_CURRENCIES || "{}"
    )

  // =====================
  // 全部汇率
  // =====================

  if (
    /^(汇率|全部汇率|所有汇率|实时汇率)$/i
      .test(
        query.trim()
      )
  ) {

    const rates =
      await getExchangeRate(
        "USD",
        "*",
        env
      )

    if (
      !rates ||
      typeof rates !== "object" ||
      Object.keys(rates).length === 0
    ) {

      const result =
        "汇率获取失败"

      if (stream) {
        return sseText(result)
      }

      return jsonOpenAI(
        result,
        requestedModel
      )

    }

    const reverseMap =
      Object.fromEntries(
        Object.entries(
          currencyMap
        ).map(
          ([name, code]) => [
            code,
            name
          ]
        )
      )

    const updateTime =
      new Date()
        .toLocaleString(
          "zh-CN",
          {
            timeZone:
              "Asia/Shanghai"
          }
        )

    const rows =

      Object.entries(rates)

        .sort(
          ([a], [b]) =>
            a.localeCompare(b)
        )

        .map(
          ([code, value]) => {

            const cname =
              reverseMap[code] ||
              code

            return `${cname}(${code}): ${Number(value).toFixed(6)}`
          }
        )

    const result =

      `主要货币汇率（基准 USD）

${rows.join("\n")}

━━━━━━━━━━━━
共 ${Object.keys(rates).length} 种货币

更新时间：
${updateTime}`

    if (stream) {
      return sseText(result)
    }

    return jsonOpenAI(
      result,
      requestedModel
    )

  }

  let from = null
  let to = "CNY"

  // =====================
  // USD/CNY
  // EUR/USD
  // =====================

  const pairMatch =
    query.match(
      /\b([A-Z]{3})\s*\/\s*([A-Z]{3})\b/i
    )

  if (pairMatch) {

    const validCurrencies =
      Object.values(
        currencyMap
      )

    const fromCode =
      pairMatch[1]
        .toUpperCase()

    const toCode =
      pairMatch[2]
        .toUpperCase()

    if (

      validCurrencies.includes(
        fromCode
      ) &&

      validCurrencies.includes(
        toCode
      )

    ) {

      from = fromCode
      to = toCode

    }

  }

  // =====================
  // 中文名称匹配
  // =====================

  if (!from) {

    for (
      const [name, code]
      of Object.entries(
        currencyMap
      )
    ) {

      if (
        query.includes(
          name
        )
      ) {

        from = code
        break

      }

    }

  }

  // =====================
  // ISO 代码匹配
  // =====================

  if (!from) {

    const validCurrencies =
      Object.values(
        currencyMap
      )

    const codeMatches =
      query
        .toUpperCase()
        .match(
          /\b[A-Z]{3}\b/g
        )

    if (codeMatches) {

      const found =
        codeMatches.find(
          code =>
            validCurrencies.includes(
              code
            )
        )

      if (found) {

        from = found

      }

    }

  }

  // =====================
  // 未找到货币
  // =====================

  if (!from) {

    const currencyList =
      Object.entries(
        currencyMap
      )
        .map(
          ([name, code]) =>
            `${name} ${code}`
        )
        .join("\n")

    const result =

      `支持查询的货币：

${currencyList}

示例：

美元汇率
欧元汇率
日元汇率

USD/CNY
EUR/USD
GBP/CNY

输入：
汇率
全部汇率
所有汇率

可查看全部货币汇率`

    if (stream) {
      return sseText(result)
    }

    return jsonOpenAI(
      result,
      requestedModel
    )

  }

  const rate =
    await getExchangeRate(
      from,
      to,
      env
    )

  if (
    rate === null ||
    rate === undefined
  ) {

    const result =
      `${from}/${to} 汇率获取失败`

    if (stream) {
      return sseText(result)
    }

    return jsonOpenAI(
      result,
      requestedModel
    )

  }

  const reverseMap =
    Object.fromEntries(
      Object.entries(
        currencyMap
      ).map(
        ([k, v]) => [
          v,
          k
        ]
      )
    )

  const updateTime =
    new Date()
      .toLocaleString(
        "zh-CN",
        {
          timeZone:
            "Asia/Shanghai"
        }
      )

  const result =

    `${reverseMap[from] || from}汇率

货币对：
${from}/${to}

最新汇率：
${Number(rate).toFixed(6)}

更新时间：
${updateTime}`

  if (stream) {
    return sseText(result)
  }

  return jsonOpenAI(
    result,
    requestedModel
  )

}

async function handleCrypto(
  query,
  env,
  stream,
  requestedModel
) {

  const cryptoMap =
    JSON.parse(
      env.CRYPTO_SYMBOLS || "{}"
    )

  let symbol = null

  // 支持中文币名和英文代码

  for (
    const [name, code]
    of Object.entries(
      cryptoMap
    )
  ) {

    // 中文名称

    if (
      /[\u4e00-\u9fa5]/.test(name)
    ) {

      if (
        query.includes(name)
      ) {

        symbol = code
        break

      }

      continue

    }

    // 英文代码

    const regex =
      new RegExp(
        `\\b${name}\\b`,
        "i"
      )

    if (
      regex.test(query)
    ) {

      symbol = code
      break

    }

  }

  if (!symbol) {

    return null

  }

  const price =
    await getCryptoPrice(
      symbol,
      env
    )

  if (

    price === null ||

    price === undefined

  ) {

    return null

  }

  const updateTime =
    new Date()
      .toLocaleString(
        "zh-CN",
        {
          timeZone:
            "Asia/Shanghai"
        }
      )

  const reverseMap =
    Object.fromEntries(

      Object.entries(
        cryptoMap
      ).map(
        ([k, v]) => [v, k]
      )

    )

  const result =
    `${symbol}

当前价格：

${price} USDT

更新时间：

${updateTime}`

  if (stream) {

    return sseText(
      result
    )

  }

  return jsonOpenAI(
    result,
    requestedModel
  )

}

async function handleDateTimeQuery(
  query,
  stream,
  requestedModel,
  env
) {

  if (
    !isDateTimeQuery(
      query,
      env
    )
  ) {
    return null;
  }

  const text =
    String(query || "")
      .trim();

  const now = new Date();

  const timeText =
    now.toLocaleTimeString(
      "zh-CN",
      {
        timeZone:
          env.DATE_TIME_TIMEZONE ||
          "Asia/Shanghai"
      }
    );

  // 时间查询
  const isTimeQuery =
    text.includes("几点") ||
    text.includes("几点了") ||
    text.includes("现在几点") ||
    text.includes("现在时间") ||
    text.includes("当前时间") ||
    text.includes("北京时间");

  if (isTimeQuery) {

    const result =
      `当前时间：${timeText}`;

    if (stream) {
      return sseText(result);
    }

    return jsonOpenAI(
      result,
      requestedModel
    );
  }

  let offset = 0;

  if (text.includes("大大后天")) {
    offset = 4;
  }
  else if (text.includes("大后天")) {
    offset = 3;
  }
  else if (text.includes("后天")) {
    offset = 2;
  }
  else if (text.includes("明天")) {
    offset = 1;
  }
  else if (text.includes("大大前天")) {
    offset = -4;
  }
  else if (text.includes("大前天")) {
    offset = -3;
  }
  else if (text.includes("前天")) {
    offset = -2;
  }
  else if (text.includes("昨天")) {
    offset = -1;
  }

  const calendarRes =
    await fetch(
      `https://calendar.bci.kdns.fr?offset=${offset}`
    );

  if (!calendarRes.ok) {
    return null;
  }

  const calendar =
    await calendarRes.json();

  let result = "";

  // 农历
  if (
    text.includes("农历") ||
    text.includes("黄历") ||
    text.includes("阴历")
  ) {

    result =
      `农历：${calendar.lunar}

干支：
${calendar.ganzhi.year}年
${calendar.ganzhi.month}月
${calendar.ganzhi.day}日`;
  }

  // 节气
  else if (
    text.includes("节气")
  ) {

    result =
      `节气：${calendar.jieqi}

物候：${calendar.phenology}`;
  }

  // 生肖
  else if (
    text.includes("生肖") ||
    text.includes("属相")
  ) {

    result =
      `生肖：${calendar.shengxiao}`;
  }

  // 宜
  else if (
    text.includes("宜")
  ) {

    result =
      `宜：

${calendar.yi?.length
        ? calendar.yi.join("、")
        : "无"}`;
  }

  // 忌
  else if (
    text.includes("忌")
  ) {

    result =
      `忌：

${calendar.ji?.length
        ? calendar.ji.join("、")
        : "无"}`;
  }

  // 星期
  else if (
    text.includes("星期") ||
    text.includes("周几") ||
    text.includes("礼拜几")
  ) {

    result =
      `${calendar.solar}

星期${calendar.week}`;
  }

  // 日期
  else if (
    text.includes("日期") ||
    text.includes("几号") ||
    text.includes("多少号")
  ) {

    result =
      `${calendar.solar}

星期${calendar.week}

${calendar.lunar}`;
  }

  // 默认完整黄历
  else {

    result =
      `📅 日期信息

公历：
${calendar.solar}

星期：
${calendar.week}

农历：
${calendar.lunar}

干支：
${calendar.ganzhi.year}年
${calendar.ganzhi.month}月
${calendar.ganzhi.day}日

生肖：
${calendar.shengxiao}

节气：
${calendar.jieqi}

月相：
${calendar.moon}

物候：
${calendar.phenology}

宜：
${calendar.yi?.length
        ? calendar.yi.join("、")
        : "无"}

忌：
${calendar.ji?.length
        ? calendar.ji.join("、")
        : "无"}`;
  }

  if (stream) {
    return sseText(result);
  }

  return jsonOpenAI(
    result,
    requestedModel
  );
}

// =====================
// Query Helpers
// =====================

function isWeatherQuery(
  query
) {

  return /天气|weather|气候|气温|温度|下雨|预报/i
    .test(query)

}

function isExchangeRateQuery(
  query,
  env
) {

  // 股票优先

  if (
    /股价|股票|行情/i.test(query)
  ) {

    return false

  }

  const cryptoMap =
    JSON.parse(
      env.CRYPTO_SYMBOLS || "{}"
    )

  const cryptoCodes =
    Object.values(
      cryptoMap
    )

  if (
    cryptoCodes.includes(
      query.trim()
        .toUpperCase()
    )
  ) {

    return false

  }

  const currencyMap =
    JSON.parse(
      env.FX_CURRENCIES || "{}"
    )

  const keywordMatch =
    Object.keys(currencyMap)
      .some(
        name =>
          query.includes(name)
      )

  const rateMatch =
    /汇率/i.test(query)

  const currencyCodes =
    Object.values(
      currencyMap
    )

  const upper =
    query.toUpperCase()

  const codeMatch =
    currencyCodes.some(
      code =>
        new RegExp(
          `\\b${code}\\b`
        ).test(upper)
    )

  const result =

    keywordMatch ||

    rateMatch ||

    codeMatch

  return result

}

function isCryptoQuery(
  query,
  env
) {

  const cryptoMap =
    JSON.parse(
      env.CRYPTO_SYMBOLS || "{}"
    )

  const matchesCrypto =

    Object.entries(
      cryptoMap
    ).some(
      ([name, symbol]) => {

        // 中文名称
        if (
          /[\u4e00-\u9fa5]/.test(name)
        ) {

          if (
            query.includes(name)
          ) {

            return true

          }

        }

        // 英文简称
        const symbolRegex =
          new RegExp(
            `\\b${symbol}\\b`,
            "i"
          )

        if (
          symbolRegex.test(query)
        ) {

          return true

        }

        return false

      }
    )

  // 股票相关关键词优先走股票分支
  if (
    /股价|股票|行情/i.test(query)
  ) {

    return matchesCrypto

  }

  // 新闻类
  if (
    /新闻|资讯|动态/i.test(query)
  ) {

    return matchesCrypto

  }

  return matchesCrypto

}

function isDateTimeQuery(
  query,
  env
) {

  const text =
    String(query || "")
      .trim();

  const maxLength =
    Number(
      env.DATE_TIME_MAX_LENGTH || 30
    );

  if (
    text.length > maxLength
  ) {
    return false;
  }

  const patterns =
    getPatterns(
      env.DATE_TIME_KEYWORDS
    );

  const dateOnlyPatterns =
    getPatterns(
      env.DATE_ONLY_KEYWORDS
    );

  return (
    patterns.some(
      p => text.includes(p)
    ) ||
    dateOnlyPatterns.includes(
      text
    )
  );
}

function isChatQuery(query, env) {
  const patterns = getPatterns(
    env.CHAT_PATTERNS
  )

  const text = String(query || "")
    .toLowerCase()

  return patterns.some(p =>
    text.includes(
      p.toLowerCase()
    )
  )
}

function isCodingQuery(query, env) {
  const patterns = getPatterns(
    env.CODING_PATTERNS
  )

  const text = String(query || "")
    .toLowerCase()

  return patterns.some(p =>
    text.includes(
      p.toLowerCase()
    )
  )
}

// =====================
// Hermes Helpers
// =====================

function isHermesContinuePrompt(
  query,
  env
) {

  if (!query) {
    console.error(
      "CONTINUE_QUERY_EMPTY"
    );
    return false;
  }

  const text =
    String(query)
      .toLowerCase()
      .trim();

  const keywords =
    String(
      env.HERMES_CONTINUE_KEYWORDS || ""
    )
      .split(/[\n,;]/)
      .map(v =>
        v.trim().toLowerCase()
      )
      .filter(Boolean);

  const matched =
    keywords.filter(
      keyword =>
        text.includes(keyword)
    );

  console.error(
    "CONTINUE_QUERY=" +
    text.slice(0, 1000)
  );

  console.error(
    "CONTINUE_ENV=" +
    String(
      env.HERMES_CONTINUE_KEYWORDS || ""
    )
  );

  console.error(
    "CONTINUE_KEYWORDS=" +
    JSON.stringify(keywords)
  );

  console.error(
    "CONTINUE_MATCHED=" +
    JSON.stringify(matched)
  );

  const result =
    matched.length > 0;

  console.error(
    "HERMES_CONTINUE_RESULT=" +
    result
  );

  return result;
}

function isHermesImageSummary(
  text
) {

  if (!text) {
    return false;
  }

  const lower =
    text.toLowerCase();

  return (
    lower.includes(
      "the user attached an image"
    )
    ||
    lower.includes(
      "image attached at:"
    )
    ||
    lower.includes(
      "图片已保存"
    )
    ||
    lower.includes(
      "图片id"
    )
  );

}

// =====================
// log Helpers
// =====================

function logPreview(
  label,
  value,
  max = 200
) {

  const text =
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();

}