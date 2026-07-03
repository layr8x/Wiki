-- 20260703_kakao_insights_bundle.sql
-- 심화 분석 Slack 리포트(kakao-insights)용 데이터 번들 RPC.
-- 기존 분석 RPC(topic_pain·sla_attainment·weekly_trend·hourly_inflow·channel_analysis)를 조합하고,
-- 분류 품질·무응답·감정 요약을 더해 한 번의 호출로 리포트 전체 데이터를 반환한다.
create or replace function public.kakao_insights()
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'quality', jsonb_build_object(
      'total_chats', (select count(*) from public.kakao_partner_chats),
      'etc_cnt', (select count(*) from public.kakao_partner_chats where category = '기타'),
      'etc_pct', (select round(100.0 * count(*) filter (where category = '기타') / nullif(count(*), 0), 1)
                  from public.kakao_partner_chats where category is not null),
      'unclassified', (select count(*) from public.kakao_partner_chats where category is null),
      'mock_cnt', (select count(*) from public.kakao_partner_chats where category = '모의고사·서바이벌'),
      'sent_total', (select count(*) from public.kakao_partner_messages where sender_type = 'user' and message is not null),
      'sent_done', (select count(*) from public.kakao_partner_messages where sender_type = 'user' and sentiment is not null),
      'sent_neg_pct', (select round(100.0 * count(*) filter (where sentiment = 'negative')
                       / nullif(count(*) filter (where sentiment is not null), 0), 1)
                       from public.kakao_partner_messages where sender_type = 'user')
    ),
    'top_categories', (select jsonb_agg(jsonb_build_object('category', category, 'cnt', c) order by c desc)
      from (select category, count(*) c from public.kakao_partner_chats
            where last_log_send_at >= now() - interval '30 days' and category is not null
            group by category order by count(*) desc limit 7) x),
    'topic_pain', public.kakao_topic_pain(14),
    'sla', public.kakao_sla_attainment(7),
    'sla_status', public.kakao_sla_status(),
    'weekly', public.kakao_weekly_trend(3),
    'hourly', public.kakao_hourly_inflow(14),
    'channels', public.kakao_channel_analysis(7),
    'unanswered', (
      select coalesce(jsonb_build_object('total', sum(cnt), 'by_channel', jsonb_object_agg(label, cnt)),
                      jsonb_build_object('total', 0, 'by_channel', '{}'::jsonb))
      from (
        select cl.label, count(*) cnt
        from public.kakao_partner_chats c
        join (select unnest(array['_VGAQn','_TkpPG','_xfxilXn']) pid, unnest(array['마이클래스','라이브','시대인재C']) label) cl
          on cl.pid = c.profile_id
        where c.last_log_send_at >= now() - interval '30 days'
          and exists(select 1 from public.kakao_partner_messages m where m.chat_id = c.chat_id and m.sender_type = 'user')
          and not exists(select 1 from public.kakao_partner_messages m where m.chat_id = c.chat_id and m.sender_type = 'manager')
        group by cl.label
      ) u
    )
  );
$$;

grant execute on function public.kakao_insights() to anon, authenticated;
