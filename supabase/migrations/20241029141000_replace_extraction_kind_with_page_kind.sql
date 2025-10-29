begin;

alter table public.page_structured
    add column extracted_page_kind public.page_kind;

update public.page_structured
set extracted_page_kind = case extracted_kind
    when 'event' then 'event_detail'
    when 'non_event' then 'other'
    else null
end
where extracted_kind is not null;

alter table public.page_structured
    drop column extracted_kind;

drop type public.extraction_kind;

commit;
