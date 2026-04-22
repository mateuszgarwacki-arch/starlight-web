# [ARCHIVED] Starlight Production System — Access Design (February 2026)

> **⚠️ HISTORICAL DOCUMENT — DO NOT USE FOR CURRENT SYSTEM FACTS**
>
> This document describes the **original MS Access-based system design** from February 2026. That system has been replaced by a Next.js + Supabase web application (live since March 2026, currently at Session 35).
>
> It is preserved here for historical reference and to capture the original design reasoning behind the data model. Many tables, field names, and conventions have evolved. The four design principles and the Four Zones model described here remain authoritative and are carried forward into `01_overview.md`.
>
> For current system facts, see the other numbered docs in the knowledge base root.
>
> **Superseded by:** `01_overview.md`, `02_architecture.md`, `03_database_schema.md`, `05_conventions.md`
> **Archived on:** 22 April 2026

---

**STARLIGHT**

PRODUCTION SYSTEM

Consolidated Design Document

Version 3.0

*This document is the single source of truth for the Starlight
Production System.*

*Every table, every field, every business rule, and the reasoning behind
each.*

Confidential Internal Document

February 2026

**Document Map**

This document supersedes Blueprint v2.0, Schema v2.0, and the Project
Summary. It incorporates all structural decisions made during detailed
design review, including resolution of ten identified issues, addition
of a materials management layer, and a fundamental restructuring of the
execution model to support multi-person Work Orders.

**Part 1: Foundations** --- What Starlight is, the principles that
govern it, the business it serves, and the technical platform.

**Part 2: Data Architecture** --- Every table, every field, every type,
every constraint. The complete schema with the reasoning behind each
structural decision.

**Part 3: Relationships** --- How tables connect. Every foreign key and
what it means.

**Part 4: Business Rules** --- Derived statuses, cost calculations,
lifecycle rules, phase ordering, procurement logic. The behaviour layer
that sits on top of the data.

**Part 5: System Behaviour** --- The complexity model, the precedent
library, photography, quote import, and quote version comparison.

**Part 6: User Experience** --- The four zones, the four desktop forms,
and the freelancer mobile interface.

**Part 7: Open Issues** --- What remains to be resolved before go-live
and what is deferred to Phase 2.

**Part 1: Foundations**

**1.1 What Starlight Is**

Starlight is a bespoke production management system for a high-end
events and scenery company. The business builds sets, furniture, bars,
stages, and scenic elements for private high-net-worth clients. All
carpentry, joinery, and finishing is done by freelancers. The owner
currently operates as workshop manager, foreman, planner, and designer
simultaneously.

The system exists to answer five questions with confidence and real
data:

**1.** Are we making or losing money on this specific item?

**2.** How accurate was our estimate versus what it actually cost?

**3.** Where is our time and money actually going?

**4.** Can we take on this new project given current capacity?

**5.** Here are the numbers --- we are ready to scale.

**1.2 Design Principles**

Four principles govern every decision in this system. When any proposed
feature, field, or process conflicts with these principles, the
principles win.

+-----------------------------------------------------------------------+
| **Principle 1: If It Is Worth Planning Individually, It Is Worth      |
| Tracking**                                                            |
|                                                                       |
| *This replaces any minimum size threshold, complexity check, or time  |
| filter. If a task is too small to plan individually, it does not need |
| a Work Order. Below that line, it is just part of doing the job. No   |
| other rule needed.*                                                   |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **Principle 2: More Friction, Less Done**                             |
|                                                                       |
| *The system exists to support experienced people, not constrain them. |
| Every screen, field, and process is judged against this. If it slows  |
| people down without a clear data payoff, it does not belong.*         |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **Principle 3: Soft Signals Only**                                    |
|                                                                       |
| *The system surfaces information. It never hard-blocks experienced    |
| people from proceeding. Phase ordering, dependency warnings, capacity |
| gaps --- all are signals, never locks. The exceptions are explicit:   |
| Work Order completion requires a photo, and Scope Item completion     |
| requires a photo or waiver.*                                          |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **Principle 4: Split a Work Order When the Split Changes the          |
| Assignee, the Rate, the Risk, or the Estimate**                       |
|                                                                       |
| *Otherwise keep it together. A stage build that goes CUT → ASSEMBLE → |
| PRIME → SCENIC PAINT is three Work Orders if the scenic work needs a  |
| specialist, not four. The cut and assemble collapse if the same team  |
| does both in the same session at the same rate.*                      |
+-----------------------------------------------------------------------+

**1.3 Business Context**

High-mix, low-volume bespoke work. Every project is different. Quick
turnarounds, dynamic scheduling, frequent scope changes mid-project.
Agility is the competitive advantage --- scope changes mid-build are not
edge cases, they are the operating reality.

The workforce is almost entirely freelance with varying levels of
turnover. Any system must be dead simple for floor-level input.
Directors need confidence in the numbers before committing to expansion.
Profitability is currently known at project level but not at item level.
Estimates, materials, and labour hours are tracked informally or not at
all.

The company is very private --- no social media, no external promotion.
All photography captured through Starlight is internal craft
documentation only, never promotional. This policy must be clear in the
system and in freelancer onboarding.

**1.4 Technical Architecture**

**Database:** Microsoft Access. All desktop forms built in Access (Zones
1, 2, 3).

**Mobile interface:** Separate lightweight web application (Zone 4).
Hosted on internal server. Accessible via WiFi only from the workshop
and site.

**Stock database connection:** Linked table in Access from separate
existing Access stock database.

**Quote database connection:** Linked table in Access from existing
quote/accounts Access database. Quote import runs a direct query against
the linked table.

**PM/accounts system connection:** Job Number as universal key. Import
on job creation pulls event_date, client_name, event_location. No
further live sync required.

**Photo storage:** Internal servers. WiFi access only from workshop.
Retention policy and backup strategy to be defined before go-live.

**QR codes:** Generated via VBA library on traveller print. Encodes URL
to mobile web application for direct Work Order access.

**Cut list import:** CSV from SketchUp plugin. Material optimisation
algorithm in VBA.

**Part 2: Data Architecture --- Complete Table Definitions**

Every table in the system, listed by architectural layer. Every field
includes its type, purpose, and any constraints or notes. This section
is the authoritative reference for the database build.

**2.1 Layer 1 --- Job & Commercial Tables**

The commercial wrapper. Job records, quote documents, quote line items,
and unstructured file attachments. This layer connects to external
systems via job_number and receives quote data via linked table import
from the existing accounts database.

**tbl_Production_Plan (The Job)**

Top-level project wrapper. One record per job. Status is fully derived
from child records --- never manually set. Connects to existing PM and
accounts systems via job_number. When a new Job is created, the system
automatically creates a General Scope Item (see tbl_Scope_Items).

  -------------------------- ----------- ------------------------------ ---------------
  **Field**                  **Type**    **Purpose**                    **Notes**

  **IDENTIFICATION**                                                    

  **job_id**                 INT PK      Primary key. Internal          
                                         auto-increment.                

  **job_number**             VARCHAR     Universal reference.           Mandatory.
                                         Consistent across all systems, Unique.
                                         accounts, and communications.  
                                         The join key to everything     
                                         external.                      

  **external_project_ref**   VARCHAR     Explicit link to existing PM   
                                         database record. Stored        
                                         separately to protect against  
                                         future external system         
                                         changes.                       

  **job_name**               VARCHAR     Human readable name. e.g.      
                                         Castle Howard Wedding.         

  **client_name**            VARCHAR     Pulled from existing system on Read only
                                         import.                        

  **event_date**             DATE        The master constraint. All     Mandatory
                                         scheduling, capacity, and      
                                         urgency logic derives from     
                                         this.                          

  **event_location**         VARCHAR     Venue or site. Pulled from     
                                         existing system.               

  **BUDGET**                                                            

  **budget_allowance**       DECIMAL     Workshop production budget for 
                                         this job. Not the total quote  
                                         value --- the portion          
                                         allocated to build and prep.   

  **NOTES**                                                             

  **pm_note**                TEXT        Free text from PM or designer. PM write access
                                         Style, feel, client            
                                         personality, known             
                                         sensitivities. Zone 1 only --- 
                                         never visible on workshop      
                                         floor.                         

  **FLAGS**                                                             

  **post_event_delivery**    BOOLEAN     Suppresses auto-close signal   Default false
                                         when a post-event delivery is  
                                         outstanding. e.g. prop to      
                                         client as souvenir. Default    
                                         false.                         

  **DERIVED STATUS --- NOT                                              
  STORED**                                                              

  **status (derived)**       DERIVED     Planning / Active / Closing /  Never stored
                                         Closed. Calculated from Work   
                                         Order states, Scope Item       
                                         states, and event date. See    
                                         Part 4 for full derivation     
                                         rules.                         

  **AUDIT**                                                             

  **created_by**             INT FK      Who created this job record.   
                                         Links to tbl_Freelancers.      

  **created_at**             TIMESTAMP   When record was created.       Auto
  -------------------------- ----------- ------------------------------ ---------------

**tbl_Quotes (Quote Documents)**

One record per quote document. A single job can have multiple quotes ---
separate documents for different event zones, phased scope, or competing
supplier comparisons. When a new quote version is imported with status
Accepted, the previous version moves to Superseded and the system
prompts the PM to review affected Scope Items.

  ----------------------- ----------- ------------------------------ ---------------
  **Field**               **Type**    **Purpose**                    **Notes**

  **quote_id**            INT PK      Primary key.                   

  **job_id**              INT FK      Links to tbl_Production_Plan.  

  **quote_reference**     VARCHAR     Quote document number. e.g.    
                                      39112.                         

  **quote_version**       VARCHAR     Version of this quote. e.g.    
                                      v6.                            

  **quote_description**   VARCHAR     What this quote covers. e.g.   
                                      Nightclub and Campsite. Useful 
                                      when multiple quotes exist on  
                                      one job.                       

  **quote_value**         DECIMAL     Total commercial value of this 
                                      quote document.                

  **quote_date**          DATE        When this quote was issued.    

  **status**              ENUM        Draft / Issued / Accepted /    
                                      Superseded.                    

  **notes**               TEXT        Any context about this quote   Nullable
                                      version.                       

  **imported_at**         TIMESTAMP   When imported into Starlight.  Auto

  **imported_by**         INT FK      Who imported it.               
  ----------------------- ----------- ------------------------------ ---------------

**tbl_Quote_Lines (Raw Quote Import)**

Every line from every imported quote document. Commercial record only
--- not interpreted, not restructured. The source for all downstream
scope creation. Imported via linked table query from the existing Access
quote database. The heading hierarchy from the source database provides
event_zone (level 1 headings) and line_sub_group (level 2 headings)
automatically during import.

+-----------------------------------------------------------------------+
| **Design Decision: interpretation_complete Replaces scope_item_id**   |
|                                                                       |
| *Earlier versions stored a scope_item_id FK on this table to track    |
| which lines had been interpreted into Scope Items. This broke when    |
| one line produced multiple Scope Items. The relationship is now       |
| managed entirely from tbl_Scope_Items.quote_line_id. The              |
| interpretation_complete flag is a manual PM confirmation that all     |
| deliverables have been extracted from this line.*                     |
+-----------------------------------------------------------------------+

  ----------------------------- ----------- ------------------------------ ---------------
  **Field**                     **Type**    **Purpose**                    **Notes**

  **quote_line_id**             INT PK      Primary key.                   

  **quote_id**                  INT FK      Links to tbl_Quotes. Lines     
                                            belong to a specific quote     
                                            document.                      

  **job_id**                    INT FK      Denormalised for query         
                                            convenience.                   

  **line_number**               VARCHAR     Original numbering from quote  VARCHAR not INT
                                            document. Stored as string to  
                                            preserve hierarchical notation 
                                            (1.1, 1.11, 2.3). May include  
                                            decimals for inserted lines    
                                            between versions.              

  **import_sequence**           INT         Order lines were imported.     Auto on import
                                            Guarantees stable sort order   
                                            in forms regardless of         
                                            line_number format.            

  **line_text**                 TEXT        Free text exactly as it        
                                            appears in the quote. Not      
                                            interpreted. Includes          
                                            supplementary notes.           

  **line_value**                DECIMAL     Commercial value of this line. Nullable

  **event_zone**                VARCHAR     Which section of the event.    
                                            e.g. Campsite, Ceremony,       
                                            Nightclub. Auto-populated from 
                                            level 1 headings during        
                                            import.                        

  **line_sub_group**            VARCHAR     Functional grouping within     NEW in v3.0
                                            event zone. e.g. Décor,        
                                            Lighting, Sound, Power, Crew.  
                                            Auto-populated from level 2    
                                            headings during import. Drives 
                                            automatic category suggestion. 

  **category**                  ENUM        Workshop Build /               
                                            Stock-and-Hire / Subcontracted 
                                            / Crew-and-Logistics /         
                                            Provisional. Auto-suggested    
                                            from line_sub_group via        
                                            mapping in tbl_Master_Lookups. 
                                            PM confirms or overrides.      

  **pm_note**                   TEXT        PM annotation on this specific PM write access
                                            line. Client intent,           
                                            constraints, references.       

  **interpretation_complete**   BOOLEAN     PM confirms all Scope Items    NEW in v3.0
                                            have been extracted from this  
                                            line. Controls the             
                                            Uninterpreted Lines panel.     
                                            Default false.                 

  **kit_list_exported**         BOOLEAN     Whether Job Items from this    Default false
                                            line have been exported to Kit 
                                            List system.                   

  **imported_at**               TIMESTAMP   When imported.                 Auto
  ----------------------------- ----------- ------------------------------ ---------------

+-----------------------------------------------------------------------+
| **Removed Field: workshop_deliverable**                               |
|                                                                       |
| *Previously auto-derived from category. Removed in v3.0. The          |
| Uninterpreted Lines query now derives this inline: category IN        |
| (Workshop Build, Stock-and-Hire, Provisional) AND                     |
| interpretation_complete = false.*                                     |
+-----------------------------------------------------------------------+

**tbl_Job_Attachments (Job Folder)**

Unstructured dump zone at job level. Photos, PDFs, drawings, inspiration
images, meeting notes. No structure required on upload. Can be
associated with a Scope Item or Quote Line later --- never required to
be.

  ------------------- ----------- ------------------------------ ---------------
  **Field**           **Type**    **Purpose**                    **Notes**

  **attachment_id**   INT PK      Primary key.                   

  **job_id**          INT FK      Links to tbl_Production_Plan.  

  **scope_item_id**   INT FK      Nullable. Associated with      Nullable
                                  specific Scope Item after the  
                                  fact by PM.                    

  **quote_line_id**   INT FK      Nullable. Associated with      Nullable
                                  specific quote line if         
                                  relevant.                      

  **file_path**       VARCHAR     Server path. Internal servers  
                                  only. WiFi access from         
                                  workshop only.                 

  **file_type**       ENUM        Photo / PDF / Drawing / Note / 
                                  Other.                         

  **uploaded_by**     INT FK      Who uploaded.                  

  **uploaded_at**     TIMESTAMP   When uploaded.                 Auto

  **caption**         VARCHAR     Optional one-line context.     Nullable
  ------------------- ----------- ------------------------------ ---------------

**2.2 Layer 2 --- Production Structure Tables**

The interpretation layer. Where commercial language from quotes becomes
workshop language. Scope Items are the buildable deliverables. Job Items
are their physical components. The prompt engine suggests typical
components when a Scope Item is categorised.

**tbl_Scope_Items (Buildable Deliverables)**

Physical objects the client is buying, as interpreted by the Production
Manager from quote lines. One Scope Item equals one distinct buildable
object. The General Scope Item (is_general = true) is auto-created per
job to capture non-deliverable work.

  ----------------------------- ----------- ----------------------------------- ---------------
  **Field**                     **Type**    **Purpose**                         **Notes**

  **IDENTIFICATION**                                                            

  **scope_item_id**             INT PK      Primary key.                        

  **job_id**                    INT FK      Links to tbl_Production_Plan.       

  **quote_line_id**             INT FK      Nullable. The quote line this was   Nullable
                                            interpreted from. One line may      
                                            produce multiple Scope Items ---    
                                            this FK handles the many-to-one.    

  **modified_quote_line_id**    INT FK      Nullable. The quote line from a     NEW in v3.0
                                            newer version that triggered a      
                                            modification of this Scope Item.    
                                            Captures the revision source.       

  **DESCRIPTION**                                                               

  **name**                      VARCHAR     Clear workshop name. Free text.     Free text
                                            e.g. 12ft Circular Bar ---          
                                            Campsite.                           

  **category_id**               INT FK      Nullable. Links to                  Drives prompts
                                            tbl_Scope_Item_Categories. Triggers 
                                            prompt engine.                      

  **description**               TEXT        Full specification. Dimensions,     
                                            finish requirements, references,    
                                            constraints.                        

  **event_zone**                VARCHAR     Where on site. Inherited from quote 
                                            line, can be overridden.            

  **COMPLEXITY**                                                                

  **complexity_construction**   ENUM        1 Straightforward / 2 Skilled / 3   
                                            Bespoke-Artistic.                   

  **finish_relative**           ENUM        Harder-than-construction-warrants / 
                                            Neutral / Suits-the-form.           

  **STATUS & LIFECYCLE**                                                        

  **status**                    ENUM        Provisional / Active / Modified /   
                                            Workshop Complete / Completed /     
                                            Cancelled-Cost-Retained. See Part 4 
                                            for lifecycle rules.                

  **is_general**                BOOLEAN     Flags the auto-created General      System only
                                            Scope Item. Exempt from closure     
                                            photo check and                     
                                            active-items-at-closure check. PM   
                                            cannot set manually.                

  **completion_photo_path**     VARCHAR     Mandatory before Completed status   
                                            unless waiver granted. Whole        
                                            assembled object, typically         
                                            photographed on site.               

  **photo_waiver**              BOOLEAN     PM confirms no completion photo is  NEW in v3.0
                                            possible. Default false.            

  **photo_waiver_reason**       VARCHAR     Required when photo_waiver is true. NEW in v3.0
                                            e.g. Item consumed during event.    

  **cancellation_reason**       TEXT        Required if status moves to         Nullable
                                            Cancelled-Cost-Retained.            

  **AUDIT**                                                                     

  **created_by**                INT FK      PM who created this item.           

  **created_at**                TIMESTAMP   Auto.                               

  **modified_at**               TIMESTAMP   Auto-updates on any change.         
  ----------------------------- ----------- ----------------------------------- ---------------

**tbl_Scope_Item_Categories (Object Types)**

The prompt engine foundation. Standard object types that appear
repeatedly across jobs. Each category carries typical components
surfaced as soft prompts. Never auto-populated --- always a suggestion.

  ----------------- ---------- ------------------------------ ---------------
  **Field**         **Type**   **Purpose**                    **Notes**

  **category_id**   INT PK     Primary key.                   

  **name**          VARCHAR    Category name. Bar / Stage /   
                               DJ Booth / Dancefloor /        
                               Signage / Drape Structure /    
                               Step Unit / Plinth etc.        

  **description**   VARCHAR    Brief note on what this        
                               category covers.               

  **active**        BOOLEAN    Whether this category appears  
                               in dropdowns. Default true.    
  ----------------- ---------- ------------------------------ ---------------

**tbl_Category_Prompts (Typical Components per Category)**

The prompt list per Scope Item category. When a bar is created, these
items are suggested as starting points for the Job Items breakdown. The
PM confirms, modifies, or dismisses each. Nothing is created
automatically.

  ----------------------- ---------- ------------------------------ ---------------
  **Field**               **Type**   **Purpose**                    **Notes**

  **prompt_id**           INT PK     Primary key.                   

  **category_id**         INT FK     Links to                       
                                     tbl_Scope_Item_Categories.     

  **description**         VARCHAR    The suggested component. e.g.  
                                     Bar carcass sections /         
                                     Drop-over tops / Kicker trim.  

  **typical_item_type**   ENUM       Stock / Stock-Needs-Work /     Soft suggestion
                                     Bespoke. Pre-selects type in   
                                     Job Item form.                 

  **display_order**       INT        Sequence prompts appear in the 
                                     form.                          

  **notes**               VARCHAR    Guidance on this component.    Nullable
  ----------------------- ---------- ------------------------------ ---------------

**tbl_Job_Items (The Breakdown)**

Individual physical items that make up a Scope Item. The bridge between
the stock database and Work Orders. Connects to the Kit List system via
export. Connects to Work Orders via junction table for coverage
tracking.

  -------------------------- ----------- ------------------------------ ---------------
  **Field**                  **Type**    **Purpose**                    **Notes**

  **IDENTIFICATION**                                                    

  **item_id**                INT PK      Primary key.                   

  **job_id**                 INT FK      Links to tbl_Production_Plan.  

  **scope_item_id**          INT FK      Links to parent Scope Item.    

  **ITEM DEFINITION**                                                   

  **description**            VARCHAR     Plain description. e.g. Bar    
                                         carcass section / 8x4 Flat     
                                         Frame.                         

  **item_type**              ENUM        Stock: warehouse pull, Kit     
                                         List only. Stock-Needs-Work:   
                                         warehouse pull plus task.      
                                         Bespoke: must be built. Type   
                                         informs but never              
                                         auto-triggers WO creation.     

  **stock_reference**        VARCHAR     Nullable. Reference in         Null for
                                         existing stock database.       Bespoke

  **quantity**               DECIMAL     How many.                      

  **unit**                   VARCHAR     Each / Sheet / Metre / Set     
                                         etc. From tbl_Master_Lookups.  

  **finish_required**        TEXT        Nullable. What needs doing.    
                                         e.g. Cover in hessian fabric.  
                                         Present on Stock-Needs-Work    
                                         items. Informs WO creation.    

  **KIT LIST EXPORT**                                                   

  **kit_list_exported**      BOOLEAN     Whether exported to Kit List   Default false
                                         system. Default false.         

  **kit_list_exported_at**   TIMESTAMP   When export was run.           Nullable

  **NOTES & AUDIT**                                                     

  **notes**                  TEXT        Any additional context.        Nullable

  **created_by**             INT FK      Who added this item.           

  **created_at**             TIMESTAMP   Auto.                          
  -------------------------- ----------- ------------------------------ ---------------

**2.3 Layer 3 --- Execution Tables**

Where work happens. Work Orders define tasks. Time Entries record who
worked on each task and for how long. The BOM captures materials per
task. The junction table links Job Items to Work Orders for coverage
tracking.

+-----------------------------------------------------------------------+
| **Structural Change in v3.0: Multi-Person Work Orders**               |
|                                                                       |
| *Previous versions assumed one person per Work Order. Real workshop   |
| conditions require multiple people working simultaneously on the same |
| task. The execution model now uses tbl_WO_Time_Entries as a child     |
| table under Work Orders. Each person logs their own time              |
| independently. Cost is calculated per entry and summed to the Work    |
| Order level.*                                                         |
+-----------------------------------------------------------------------+

**tbl_JobItem_WorkOrder (Junction Table)**

Resolves the many-to-many relationship between Job Items and Work
Orders. Multiple Job Items can feed one Work Order (e.g. carcasses and
timber cladding pre-installed together). One Job Item can contribute to
multiple Work Orders across different phases. Primary purpose is
coverage visibility --- ensuring every Job Item has planned work against
it.

  ------------------- ---------- ------------------------------ ---------------
  **Field**           **Type**   **Purpose**                    **Notes**

  **junction_id**     INT PK     Primary key.                   

  **job_item_id**     INT FK     Links to tbl_Job_Items.        Mandatory

  **work_order_id**   INT FK     Links to tbl_Work_Orders.      Mandatory

  **notes**           VARCHAR    Optional context about this    Nullable
                                 item's role in this WO.       
  ------------------- ---------- ------------------------------ ---------------

+-----------------------------------------------------------------------+
| **Form Design: Checkbox Selection**                                   |
|                                                                       |
| *The PM selects Job Items via checkboxes when creating a Work Order.  |
| Junction records are created by VBA behind the scenes. The PM never   |
| interacts with the junction table directly.*                          |
+-----------------------------------------------------------------------+

**tbl_Work_Orders (The Task)**

The granular unit of work. The most important table in the system.
Defines what needs doing, to what standard, with what materials.
Execution data (who worked, how long, at what cost) lives in
tbl_WO_Time_Entries. The Work Order aggregates those entries for cost
rollup and precedent tracking.

  ------------------------------- ----------- ------------------------------ ---------------------
  **Field**                       **Type**    **Purpose**                    **Notes**

  **IDENTIFICATION**                                                         

  **work_order_id**               INT PK      Primary key.                   

  **job_id**                      INT FK      Links to tbl_Production_Plan.  

  **scope_item_id**               INT FK      Links to parent Scope Item.    

  **PLANNING**                                                               

  **activity_verb**               INT FK      Standardised action. Links to  Phase via join
                                              tbl_Master_Lookups. Phase      
                                              derived via join --- never     
                                              stored on WO.                  

  **description**                 TEXT        Plain language task            
                                              description. What needs doing, 
                                              to what, to what standard.     

  **estimated_duration_hrs**      DECIMAL     Honest rough estimate in total Mandatory pre-release
                                              person-hours. Foundation for   
                                              capacity planning and          
                                              historical comparison.         

  **reference_wo_id**             INT FK      Nullable. Links to a           
                                              historical Work Order used as  
                                              estimating precedent.          

  **COMPLEXITY**                                                             

  **complexity_construction**     ENUM        Nullable. 1/2/3. Only          Nullable --- inherits
                                              populated when this task       
                                              differs from parent Scope      
                                              Item. Inherits when null.      

  **finish_relative**             ENUM        Nullable. Only set when this   Nullable --- inherits
                                              task's finish profile differs 
                                              from the Scope Item overall.   

  **ASSIGNMENT**                                                             

  **planned_lead_id**             INT FK      Nullable. Who the PM intends   Renamed from
                                              to lead this work. Intention   planned_assignee_id
                                              only --- not used for cost.    
                                              Others may join.               

  **COST**                                                                   

  **rate_override**               DECIMAL     Nullable. PM enters an hourly  PM only
                                              rate that replaces the derived 
                                              rate for ALL time entries on   
                                              this WO. Covers specialist     
                                              one-off situations.            

  **STATUS**                                                                 

  **status**                      ENUM        Not-Started / Ready /          Ready is NEW in v3.0
                                              In-Progress / Complete /       
                                              On-Hold / Voided.              

  **on_hold_reason**              VARCHAR     Required when status set to    Nullable
                                              On-Hold.                       

  **void_reason**                 VARCHAR     Required when Voided. All open Nullable
                                              time entries must be closed    
                                              first.                         

  **TIMESTAMPS**                                                             

  **system_complete_timestamp**   TIMESTAMP   Immutable. When MARK COMPLETE  Auto
                                              was tapped.                    

  **actual_complete_timestamp**   TIMESTAMP   Overridable by PM. Defaults to PM only
                                              system timestamp.              

  **COMPLETION**                                                             

  **completion_photo_path**       VARCHAR     Mandatory at MARK COMPLETE.    Mandatory
                                              The finished-state photo.      
                                              Serves as visual               
                                              identification for loading     
                                              crews and precedent library.   
  ------------------------------- ----------- ------------------------------ ---------------------

+-----------------------------------------------------------------------+
| **Design Decision: Ready Status**                                     |
|                                                                       |
| *Ready sits between Not-Started and In-Progress. Set automatically    |
| when the traveller is printed, or manually by PM via Release Without  |
| Print. Freelancers only see Ready and In-Progress tasks on mobile.    |
| Not-Started tasks are invisible on mobile --- this prevents           |
| freelancers from picking up half-planned Work Orders.*                |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **Removed Fields in v3.0**                                            |
|                                                                       |
| *actual_assignee_id, actual_hours, applied_hourly_rate,               |
| actual_cost_labour, flag_note, system_start_timestamp,                |
| actual_start_timestamp, timestamp_edited_flag --- all moved to        |
| tbl_WO_Time_Entries to support multi-person execution.*               |
+-----------------------------------------------------------------------+

**tbl_WO_Time_Entries (Who Worked, How Long)**

One record per person per work session on a Work Order. This is where
all execution data lives. Created when a freelancer taps START or JOIN
on mobile. Closed when they tap LOG MY HOURS. Cost is calculated and
frozen per entry. The Work Order aggregates.

  ---------------------------- ----------- ------------------------------ ---------------
  **Field**                    **Type**    **Purpose**                    **Notes**

  **entry_id**                 INT PK      Primary key.                   

  **work_order_id**            INT FK      Links to parent Work Order.    Mandatory

  **freelancer_id**            INT FK      Who worked. Captured on        Mandatory
                                           START/JOIN.                    

  **system_start_timestamp**   TIMESTAMP   When they tapped START or      Auto
                                           JOIN. Immutable.               

  **actual_start_timestamp**   TIMESTAMP   Overridable by PM. Defaults to PM editable
                                           system timestamp.              

  **system_end_timestamp**     TIMESTAMP   When they tapped LOG MY HOURS. Auto
                                           Immutable.                     

  **actual_end_timestamp**     TIMESTAMP   Overridable by PM. Defaults to PM editable
                                           system timestamp.              

  **actual_hours**             DECIMAL     Hours this person worked.      Mandatory at
                                           Entered by freelancer.         close
                                           Pre-filled from timestamps as  
                                           suggestion.                    

  **applied_hourly_rate**      DECIMAL     Rate used for this entry.      Frozen at
                                           Frozen at logging. If WO       logging
                                           rate_override exists, uses     
                                           that. Otherwise: freelancer    
                                           day_rate / standard_day_hours. 

  **entry_cost**               DECIMAL     This person's cost.           Frozen at
                                           actual_hours ×                 logging
                                           applied_hourly_rate. Frozen at 
                                           logging.                       

  **flag_note**                TEXT        Optional. This person's       Nullable
                                           observation. Two sentences     
                                           max. e.g. Material arrived     
                                           warped.                        

  **timestamp_edited_flag**    BOOLEAN     Whether PM corrected any       Auto
                                           timestamp on this entry.       
  ---------------------------- ----------- ------------------------------ ---------------

+-----------------------------------------------------------------------+
| **Why Timestamps and Hours Are Both Captured**                        |
|                                                                       |
| *Timestamps are signals of commitment --- when people showed up and   |
| finished. Actual hours are the real duration data. A task spanning a  |
| weekend has timestamps days apart but actual hours might be six. Both |
| are true. Neither replaces the other. The freelancer enters hours;    |
| the system pre-fills from timestamps as a suggestion.*                |
+-----------------------------------------------------------------------+

**tbl_WO_BOM (Bill of Materials per Work Order)**

Materials assigned at Work Order level --- never at Job or Scope Item
level. This precision is what makes cost tracking and the precedent
library meaningful. Links to the materials catalogue where possible.
Includes procurement flagging.

  ----------------------- ----------- ------------------------------ ---------------
  **Field**               **Type**    **Purpose**                    **Notes**

  **bom_id**              INT PK      Primary key.                   

  **work_order_id**       INT FK      Links to parent Work Order.    

  **job_id**              INT FK      Denormalised for query         
                                      performance.                   

  **material_id**         INT FK      Nullable. Links to             NEW in v3.0
                                      tbl_Materials catalogue. Null  
                                      for one-off items not worth    
                                      cataloguing.                   

  **material_category**   INT FK      Links to tbl_Master_Lookups.   
                                      Timber / Sheet / Metal /       
                                      Fabric / Paint & Finish /      
                                      Hardware / Electrical /        
                                      Bought-In Component /          
                                      Consumable.                    

  **item_description**    VARCHAR     What this material is.         
                                      Auto-filled from catalogue     
                                      when material_id selected.     
                                      Editable.                      

  **stock_reference**     VARCHAR     Nullable. Links to stock       
                                      database if this is a held     
                                      material.                      

  **quantity**            DECIMAL     Amount required.               

  **unit**                VARCHAR     Sheets / Metres / Litres / kg  
                                      / Each etc.                    

  **unit_cost**           DECIMAL     Planned cost per unit.         
                                      Auto-filled from catalogue     
                                      current_unit_cost. Snapshot at 
                                      BOM creation.                  

  **actual_unit_cost**    DECIMAL     Nullable. What was actually    NEW in v3.0
                                      paid. Populated at ordering if 
                                      different from planned. Null   
                                      means planned equals actual.   

  **supplier**            VARCHAR     Where this comes from if not   Nullable
                                      stock.                         

  **needs_ordering**      BOOLEAN     Procurement flag. Default      
                                      false for stock, true for      
                                      purchases.                     

  **ordered_at**          TIMESTAMP   Nullable. Populated when order 
                                      confirmed placed. Null +       
                                      needs_ordering = outstanding   
                                      action.                        

  **ordered_by**          INT FK      Who placed the order.          Nullable

  **notes**               VARCHAR     Procurement or handling notes. Nullable
  ----------------------- ----------- ------------------------------ ---------------

+-----------------------------------------------------------------------+
| **Removed Field: total_cost**                                         |
|                                                                       |
| *Previously stored as quantity × unit_cost. Removed in v3.0. Always   |
| derived in queries as: quantity × NZ(actual_unit_cost, unit_cost).    |
| Eliminates sync risk when quantity or cost is edited.*                |
+-----------------------------------------------------------------------+

**2.4 Layer 4 --- Materials Management**

Central materials catalogue and price history. Provides consistent
material identification across all BOMs, tracks price changes over time,
and pre-fills BOM entries from catalogue data. Does not track running
stock levels --- physical inventory checks handle that at current scale.

**tbl_Materials (Materials Catalogue)**

The single reference list for every material in the business. When a PM
adds a BOM entry, they select from this catalogue. Description,
category, unit, and current price auto-fill. One-off items bypass the
catalogue via the nullable material_id on tbl_WO_BOM.

  ------------------------- ---------- ------------------------------ ---------------
  **Field**                 **Type**   **Purpose**                    **Notes**

  **material_id**           INT PK     Primary key.                   

  **name**                  VARCHAR    Standard name. e.g. 2×1 PAR    Mandatory.
                                       Softwood.                      Unique.

  **material_category**     INT FK     Links to Master Lookups. See   Mandatory
                                       material categories below.     

  **unit**                  VARCHAR    Standard unit. Metre / Sheet / From lookups
                                       Litre / kg / Each.             

  **standard_length**       DECIMAL    Nullable. For timber/linear    Timber only
                                       materials --- standard stock   
                                       length.                        

  **standard_sheet_size**   VARCHAR    Nullable. For sheet goods ---  Sheet only
                                       e.g. 2440×1220.                

  **current_unit_cost**     DECIMAL    Latest known price per unit.   Auto-updated
                                       Auto-updated from              
                                       tbl_Material_Prices when a new 
                                       price with the latest          
                                       effective_date is added.       

  **primary_supplier**      VARCHAR    Nullable. Default supplier for 
                                       this material.                 

  **notes**                 TEXT       Handling, ordering, or         Nullable
                                       specification notes.           

  **active**                BOOLEAN    Whether this appears in        
                                       dropdowns. Default true. Never 
                                       delete --- deactivate.         
  ------------------------- ---------- ------------------------------ ---------------

**Material Categories**

  -------------- --------------------------- -----------------------------
  **Category**   **Covers**                  **Examples**

  Timber         Dimensional lumber,         2×1 PAR, 4×2 CLS, oak
                 mouldings, dowel            moulding

  Sheet          All sheet goods             Ply, MDF, acrylic, Perspex,
                                             mirror

  Metal          Structural and decorative   Steel box section, aluminium
                 metals                      flat bar

  Fabric         Soft goods, textiles        Hessian, velour, voile,
                                             muslin, molton

  Paint & Finish All coatings and finishes   Primer, topcoat, scenic
                                             paint, lacquer

  Hardware       Fixings, fittings,          Screws, bolts, hinges,
                 mechanical                  castors, brackets

  Electrical     Anything powered or wired   LED tape, batteries,
                                             switches, cable

  Bought-In      Complete items purchased    Clock face, mirror ball, neon
  Component      and incorporated            flex tube

  Consumable     Used during production, not Sandpaper, masking tape,
                 part of final piece         glue, filler
  -------------- --------------------------- -----------------------------

**tbl_Material_Prices (Price History)**

One record per price change per material. Captures the price timeline.
When a new record is added with the latest effective_date,
tbl_Materials.current_unit_cost auto-updates via form VBA. Historical
records remain for trend analysis and precedent quoting.

  -------------------- ----------- ------------------------------ ---------------
  **Field**            **Type**    **Purpose**                    **Notes**

  **price_id**         INT PK      Primary key.                   

  **material_id**      INT FK      Links to tbl_Materials.        Mandatory

  **unit_cost**        DECIMAL     Price per unit at this point   Mandatory
                                   in time.                       

  **effective_date**   DATE        When this price became valid.  Mandatory

  **supplier**         VARCHAR     Who quoted or charged this     Nullable
                                   price.                         

  **source**           ENUM        Quote / Invoice / Estimate.    
                                   How reliable is this price.    

  **notes**            VARCHAR     Any context. Bulk discount,    Nullable
                                   minimum order etc.             

  **recorded_by**      INT FK      Who entered this price.        

  **recorded_at**      TIMESTAMP   Auto.                          Auto
  -------------------- ----------- ------------------------------ ---------------

+-----------------------------------------------------------------------+
| **Price Auto-Update Logic**                                           |
|                                                                       |
| *When a new price record is saved: IF effective_date \> the current   |
| latest effective_date for this material → update current_unit_cost.   |
| IF effective_date equals the latest AND recorded_at is more recent →  |
| update. Otherwise do not update (this is a historical correction). PM |
| can always manually edit current_unit_cost directly.*                 |
+-----------------------------------------------------------------------+

**2.5 Layer 5 --- People**

**tbl_Freelancers (The Team)**

Every person who interacts with the system. Freelancers are active
users, not just records. The Efficiency Rating from v1.0 is permanently
removed --- the performance picture emerges from actual versus estimated
hours over time, per person, per task type. Each freelancer carries
their own day rate and standard day length, from which the hourly rate
is derived.

  ------------------------ ----------- ------------------------------ ---------------
  **Field**                **Type**    **Purpose**                    **Notes**

  **freelancer_id**        INT PK      Primary key.                   

  **name**                 VARCHAR     Full name.                     

  **phone**                VARCHAR     Primary contact and mobile     
                                       login identifier.              

  **email**                VARCHAR     Secondary contact.             Nullable

  **role**                 ENUM        Production-Manager / Foreman / 
                                       Freelancer / PM-External.      
                                       Controls zone access.          

  **speciality**           VARCHAR     Primary skill. Carpenter /     
                                       Scenic-Artist / Fabricator /   
                                       Painter etc. From lookups.     

  **day_rate**             DECIMAL     Agreed day rate. The           Mandatory
                                       commercial agreement.          

  **standard_day_hours**   DECIMAL     Hours constituting one day for Mandatory
                                       this person. 8, 10, etc. Used  
                                       to derive hourly rate.         

  **active**               BOOLEAN     Currently available to be      
                                       assigned. Default true.        

  **system_access**        BOOLEAN     Has an active login. Default   
                                       true.                          

  **notes**                TEXT        Skills, working patterns,      Nullable
                                       anything relevant.             

  **created_at**           TIMESTAMP   Auto.                          
  ------------------------ ----------- ------------------------------ ---------------

+-----------------------------------------------------------------------+
| **Removed Fields in v3.0**                                            |
|                                                                       |
| *day_rate_standard (renamed to day_rate), day_rate_specialist,        |
| specialist_activity_categories --- specialist rate handling was       |
| overly complex. Replaced by rate_override on individual Work Orders   |
| for the rare cases where a different rate applies.*                   |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **Hourly Rate Derivation**                                            |
|                                                                       |
| *hourly_rate = day_rate / standard_day_hours. Always derived, never   |
| stored. A carpenter on £250/day with 10-hour days costs £25/hr. A     |
| scenic artist on £350/day with 8-hour days costs £43.75/hr. Overtime  |
| is the same rate, just more hours.*                                   |
+-----------------------------------------------------------------------+

**2.6 Layer 6 --- Master Lookups**

**tbl_Master_Lookups (The Standardisation Engine)**

Single table feeding every dropdown in the system. One new row here
updates every screen, form, and report. Activity Verbs live here
carrying their phase numbers. Retired values are deactivated --- never
deleted --- preserving historical data integrity. Sub-group to category
mappings for quote import also live here.

  ------------------- ---------- ------------------------------ ---------------
  **Field**           **Type**   **Purpose**                    **Notes**

  **lookup_id**       INT PK     Primary key.                   

  **category**        VARCHAR    Which dropdown this feeds.     
                                 ACTIVITY_VERB /                
                                 MATERIAL_CATEGORY / UNIT /     
                                 SPECIALITY / FILE_TYPE /       
                                 SUBGROUP_CATEGORY_MAP etc.     

  **value**           VARCHAR    The option that appears in the 
                                 dropdown.                      

  **display_order**   INT        Sort order within category.    

  **phase_number**    INT        Nullable. ACTIVITY_VERB only.  VERB only
                                 Position in standard build     
                                 sequence. Single source of     
                                 phase truth.                   

  **phase_label**     VARCHAR    Nullable. Human readable. e.g. VERB only
                                 Phase 1 --- Fabrication.       

  **active**          BOOLEAN    Whether this option appears in 
                                 dropdowns.                     

  **notes**           VARCHAR    Internal guidance. For         Nullable
                                 SUBGROUP_CATEGORY_MAP: stores  
                                 the default category.          
  ------------------- ---------- ------------------------------ ---------------

**Standard Phase Sequence (Activity Verbs)**

  ----------- ------------------- -------------------------------------------
  **Phase**   **Label**           **Typical Verbs**

  1           Fabrication         CUT, WELD, CNC, BUILD

  2           Sub-Assembly        ASSEMBLE, FIT, CONSTRUCT

  3           Preparation         PREP, SAND, PRIME, FILL, COVER

  4           Finishing           PAINT, SPRAY, SCULPT, WRAP, FINISH

  5           Installation /      INSTALL, DELIVER, DRESS
              Delivery            
  ----------- ------------------- -------------------------------------------

**Sub-Group to Category Mapping (Quote Import)**

  ----------------------------------- -----------------------------------
  **Sub-Group**                       **Default Category**

  Décor                               Workshop Build

  Lighting                            Subcontracted

  Sound                               Subcontracted

  Power                               Subcontracted

  Crew                                Crew-and-Logistics

  Transport                           Crew-and-Logistics

  Accommodation                       Crew-and-Logistics

  Subsistence                         Crew-and-Logistics

  Production                          Crew-and-Logistics

  Fireworks                           Subcontracted

  Video                               Subcontracted

  Furniture                           Stock-and-Hire
  ----------------------------------- -----------------------------------

**Part 3: Table Relationships**

Every foreign key represents a deliberate structural decision. This map
is complete.

  --------------------------- --------------------------- ------------- -----------------------
  **From**                    **To**                      **Type**      **Why It Matters**

  tbl_Production_Plan         tbl_Quotes                  1 : Many      One job, multiple quote
                                                                        documents

  tbl_Production_Plan         tbl_Scope_Items             1 : Many      One job, many
                                                                        deliverables (incl.
                                                                        General)

  tbl_Production_Plan         tbl_Job_Attachments         1 : Many      Job folder holds
                                                                        unlimited files

  tbl_Quotes                  tbl_Quote_Lines             1 : Many      Each quote document has
                                                                        many lines

  tbl_Quote_Lines             tbl_Scope_Items             1 : Many      One line may produce
                                                          (nullable)    multiple Scope Items

  tbl_Quote_Lines             tbl_Job_Attachments         1 : Many      Attachments linkable to
                                                          (nullable)    specific lines

  tbl_Scope_Items             tbl_Scope_Item_Categories   Many : 1      Many items share one
                                                                        category type

  tbl_Scope_Item_Categories   tbl_Category_Prompts        1 : Many      Each category has a
                                                                        prompt list

  tbl_Scope_Items             tbl_Job_Items               1 : Many      Scope Item breaks into
                                                                        components

  tbl_Scope_Items             tbl_Work_Orders             1 : Many      Scope Item requires
                                                                        multiple tasks

  tbl_Scope_Items             tbl_Job_Attachments         1 : Many      Files tied to specific
                                                          (nullable)    deliverables

  tbl_Job_Items               tbl_JobItem_WorkOrder       1 : Many      Job Item links to one
                                                                        or more WOs

  tbl_Work_Orders             tbl_JobItem_WorkOrder       1 : Many      WO links to one or more
                                                                        Job Items

  tbl_Work_Orders             tbl_WO_Time_Entries         1 : Many      Each task has multiple
                                                                        worker sessions

  tbl_Work_Orders             tbl_WO_BOM                  1 : Many      Each task carries its
                                                                        own materials

  tbl_Work_Orders             tbl_Work_Orders             Self-join     Historical precedent
                                                          (nullable)    reference

  tbl_Work_Orders             tbl_Freelancers             Many : 1      Planned lead ---
                                                                        intention only

  tbl_WO_Time_Entries         tbl_Freelancers             Many : 1      Who actually worked ---
                                                                        used for cost

  tbl_WO_BOM                  tbl_Materials               Many : 1      Links to catalogue when
                                                          (nullable)    applicable

  tbl_Materials               tbl_Material_Prices         1 : Many      Price history per
                                                                        material

  tbl_Master_Lookups          tbl_Work_Orders             1 : Many      Verb drives phase via
                                                                        join

  tbl_Master_Lookups          tbl_WO_BOM                  1 : Many      Material category
                                                                        lookup
  --------------------------- --------------------------- ------------- -----------------------

**Part 4: Business Rules & Derived Logic**

**4.1 Job Status Derivation**

Job status is never stored. It is always calculated from child record
states.

  -------------- --------------------------------------------------------
  **Status**     **Derivation Rule**

  Planning       Job exists. No Work Orders are In-Progress or Complete.

  Active         At least one Work Order is In-Progress or Complete.

  Closing        Event date has passed AND all Work Orders are Complete
                 or Voided. post_event_delivery flag suppresses if true.
                 Scope Items may be in Workshop Complete status during
                 this phase.

  Closed         PM confirms close AND all Scope Items have reached a
                 terminal state (Completed, Cancelled-Cost-Retained, or
                 Provisional) AND every Completed Scope Item has
                 completion_photo_path or photo_waiver AND no Scope Items
                 remain in Workshop Complete, Modified, or Active status.
                 General Scope Item (is_general = true) is exempt from
                 the Active-at-closure check.
  -------------- --------------------------------------------------------

**4.2 Scope Item Lifecycle**

Six possible statuses. Three are terminal (Completed,
Cancelled-Cost-Retained, Provisional-never-confirmed). Three are
transitional (Active, Modified, Workshop Complete).

  ------------------------- ------------------------- -----------------------
  **Transition**            **Trigger**               **Notes**

  Provisional → Active      PM confirms               Enables WO creation. WO
                                                      creation blocked on
                                                      Provisional items.

  Active → Modified         PM direct action OR PM    All open WOs flagged
                            response to quote version for review. PM must
                            review prompt             Confirm, Revise, or
                                                      Void each.

  Modified → Active         PM resolves all flagged   All flags cleared. Item
                            WOs                       back in play.

  Active → Workshop         All WOs Complete or       Production done.
  Complete                  Voided. No open time      Awaiting site photo.
                            entries.                  

  Workshop Complete →       Photo uploaded OR         Terminal. Precedent
  Completed                 photo_waiver granted with library reference.
                            reason                    

  Active or Modified →      PM action with reason     Terminal. Completed WO
  Cancelled-Cost-Retained                             costs preserved.

  Provisional →             PM action                 Clean removal of
  Cancelled-Cost-Retained                             unconfirmed items.
  ------------------------- ------------------------- -----------------------

**4.3 Work Order Lifecycle**

  ---------------------- ------------------------- ---------------------------
  **Transition**         **Trigger**               **Notes**

  Not-Started → Ready    Traveller printed (auto)  Soft validation fires:
                         OR PM Release Without     flags missing estimated
                         Print (manual)            hours, verb, or
                                                   description. Signal not
                                                   block.

  Ready → In-Progress    Freelancer taps START on  First time entry created.
                         mobile                    WO becomes visible as
                                                   joinable.

  In-Progress (joining)  Freelancer taps JOIN on   Additional time entry
                         mobile                    created. Multiple people
                                                   work simultaneously.

  In-Progress → Complete Freelancer taps MARK      Mandatory photo.
                         COMPLETE after all time   system_complete_timestamp
                         entries closed            captured.

  Ready or In-Progress → PM action with reason     Removes from mobile view.
  On-Hold                                          Retains all time entries.

  On-Hold → previous     PM removes hold           Returns to Ready or
  status                                           In-Progress as appropriate.

  Any → Voided           PM action. All open time  Void_reason required. Time
                         entries must be closed    entry costs preserved.
                         first (hours captured).   
  ---------------------- ------------------------- ---------------------------

**4.4 Cost Rollup Logic**

**Labour Cost**

Labour cost is calculated and frozen at the individual time entry level.
Never at Work Order or Job level.

  ---------------------- ------------------------------------------------
  **Step**               **Calculation**

  Determine hourly rate  IF Work Order rate_override IS NOT NULL:
                         applied_hourly_rate = rate_override. ELSE:
                         applied_hourly_rate = freelancer day_rate /
                         standard_day_hours.

  Time entry cost        entry_cost = actual_hours × applied_hourly_rate.
                         Frozen when freelancer logs hours.

  Work Order labour cost SUM(entry_cost) from tbl_WO_Time_Entries for
                         this WO.

  Work Order material    SUM(quantity × NZ(actual_unit_cost, unit_cost))
  cost                   from tbl_WO_BOM for this WO.

  Work Order total cost  WO labour cost + WO material cost.

  Scope Item cost        SUM(WO total costs) for all WOs on this Scope
                         Item.

  Job cost               SUM(Scope Item costs) for all Scope Items on
                         this Job.
  ---------------------- ------------------------------------------------

+-----------------------------------------------------------------------+
| **Cost Integrity Rule**                                               |
|                                                                       |
| *A Voided Work Order with time entries must have those entries closed |
| (hours captured) before voiding is confirmed. The system prompts for  |
| this. Voided WO costs roll up into the job total as real expenditure. |
| They may display separately in reports as scope-change or waste       |
| cost.*                                                                |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **Projected Cost for Open Work**                                      |
|                                                                       |
| *Not-Started/Ready: estimated_duration_hrs × planned lead's derived   |
| hourly rate. In-Progress: estimated_duration_hrs × average rate of    |
| people who have logged time so far. Complete: frozen actuals. Both    |
| projections and actuals blend in the budget-vs-actual view.*          |
+-----------------------------------------------------------------------+

**4.5 Phase Ordering Logic**

Phase number is stored on tbl_Master_Lookups against the Activity Verb
--- nowhere else. When Work Orders for a Scope Item are displayed, they
are ordered by the phase number of their Activity Verb via join. When a
predecessor phase on the same Scope Item is not yet Complete, the system
displays a soft signal only. No blocking. Phase logic is most useful
during planning --- once the build is running, experience and the
foreman take precedence.

**4.6 Procurement Logic**

Not a separate table or process. A filtered view across all active jobs:

**Outstanding orders:** tbl_WO_BOM WHERE needs_ordering = true AND
ordered_at IS NULL.

This is the live procurement action list. When an order is placed, PM
populates ordered_at and optionally actual_unit_cost. Item disappears
from the list.

**Part 5: System Behaviour**

**5.1 The Complexity Model**

Two honest dimensions, not one matrix.

**Dimension 1 --- Construction Complexity (1 to 3)**

  ----------------- -------------------------- --------------------------
  **Grade**         **Definition**             **Examples**

  1 ---             Repetitive, defined, no    Flat panels, box
  Straightforward   surprises.                 carcasses, simple joinery.

  2 --- Skilled     Requires experience and    Complex joinery,
                    judgement but follows      structural builds,
                    known patterns.            detailed fabrication.

  3 --- Bespoke /   Genuinely unique. High     Organic forms, structural
  Artistic          risk. No direct precedent. sculptures, complex
                                               assemblies.
  ----------------- -------------------------- --------------------------

**Dimension 2 --- Finish Relative to Construction**

  --------------------------- -------------------------------------------
  **Position**                **Meaning**

  Harder than the             A flat utilitarian finish on an organic
  construction warrants       form. The substrate fights the finish
                              standard. More time, higher risk.

  Neutral                     Finish difficulty is proportionate to
                              construction complexity. Standard
                              relationship.

  Suits the form              An artistic or distressed finish on a
                              complex form. Works with construction. More
                              time-consuming but lower technical risk.
  --------------------------- -------------------------------------------

Complexity on Work Orders is nullable --- inherits from parent Scope
Item when null. Only populated when a specific task genuinely differs
(e.g. scenic painting WO on a standard-build Scope Item).

**5.2 The Precedent Library**

Long-term goal. Every completed Work Order becomes a reference point.
Future estimating question: what is the closest thing we have built
before? Matching fields: Activity Verb, Construction Complexity, Finish
position, material type, photos. reference_wo_id on Work Orders records
which historical WO informed a current estimate.

The scores become search filters. The completion photos provide visual
confirmation the match is genuine. The time entries provide real
duration data broken down by number of people. This is two to three
years away from being statistically meaningful. Fields must be captured
consistently from day one.

**5.3 Photography Rules**

  ----------------- --------------------- ----------------- ---------------
  **Photo**         **When**              **Mandatory?**    **Taken By**

  WO Completion     MARK COMPLETE on      Yes               Person marking
  Photo             mobile                                  task complete

  Scope Item Photo  Workshop Complete →   Yes (waiver       PM or site crew
                    Completed             option available) 
  ----------------- --------------------- ----------------- ---------------

WO completion photo serves dual purpose: craft documentation for the
precedent library, and visual identification for loading crews matching
kit list items to physical objects.

Scope Item photo is the whole assembled piece, typically on site. If
impossible (item consumed, client denied access), PM grants a waiver
with mandatory reason.

All photos are internal only. Not promotional. Not shared with clients
unless explicitly requested. Equivalent to a technical drawing.

**5.4 Quote Import**

Quotes are imported directly from the existing Access quote database via
linked table query. The PM enters the quote reference, selects the
version, and clicks Import. The system pulls every line from the source
database, maps the heading hierarchy to event_zone (level 1) and
line_sub_group (level 2), auto-suggests category from the sub-group
mapping in tbl_Master_Lookups, and creates all tbl_Quote_Lines records.

After import, the system compares the sum of line_value entries against
the quote_value on the tbl_Quotes record. Match shows green. Mismatch
shows amber with difference displayed.

**5.5 Quote Version Comparison**

When a new quote version is imported against a job with an existing
version, the system performs a line_number comparison between versions.
Because the quote numbering convention keeps existing numbers stable and
uses decimals for insertions (1.1, 1.11, 1.2), the comparison
identifies:

**New lines:** exist in new version but not in previous → highlighted
green.

**Removed lines:** exist in previous but not in new version →
highlighted red.

**Changed lines:** same line_number in both but different value or text
→ highlighted amber.

When a new version is Accepted and the previous is Superseded, the
system prompts: how many lines changed, how many are linked to existing
Scope Items. The PM reviews each affected Scope Item and decides:
Unchanged, Modified, or Cancelled.

**Part 6: User Experience**

**6.1 The Four Zones**

**Zone 1 --- The Architect (Planning)**

Production Manager only. Job invisible to workshop. Creates Job, imports
quotes, creates Scope Items, breaks them into Job Items (searching the
stock database), creates Work Orders, assigns people, checks capacity.
Soft validation before release: flags missing estimated durations,
verbs, or descriptions but never blocks. Release sets WO status to
Ready.

**Zone 2 --- The Commander (Active Workshop)**

After release. Foreman view. All active Work Orders across all live
jobs, ordered by phase and urgency relative to Event Date. No budget
figures. No client commercial details. Task, complexity, assignee,
materials, phase signal. Traveller printable with QR code.

**Zone 3 --- The Auditor (Review & Exceptions)**

Not batch data entry --- real-time freelancer self-logging makes that
obsolete. Zone 3 is exception handling: timestamp corrections on time
entries, flag note review, scope change management, budget
reconciliation, voiding started Work Orders, PM force-close of open time
entries.

**Zone 4 --- The Workshop (Freelancer Mobile)**

Separate web application. Shared database. Phone browser. Internal WiFi
only. Full job visibility. Self-assignment permitted. Trust is the
operating principle.

**6.2 The Four Desktop Forms**

**Form 1 --- Quote & Lines (frm_Quote_Lines)**

Top: job header. Middle: quote tabs (one per document). Bottom: quote
lines table with category dropdown, PM note field, amber highlight on
uninterpreted workshop-deliverable lines (category IN Workshop Build,
Stock-and-Hire, Provisional AND interpretation_complete = false). Create
Scope Item button on uninterpreted rows. Quote version comparison
indicators when multiple versions exist.

**Form 2 --- Scope & Breakdown (frm_Scope_Breakdown)**

Top: Scope Item header (name, description, category, zone, status,
complexity, finish, photo placeholder). Prompt engine: category
selection triggers side panel with typical components.
Add/Modify/Dismiss each. Middle: Job Items grid with stock database
search. Coverage indicator per item showing linked WOs. Checkbox
selection for Work Order creation. Export to Kit List button. Bottom:
attachments, navigation to Form 3.

**Form 3 --- Work Orders (frm_Work_Orders)**

Context bar: Scope Item, job, event date, days remaining. Work Orders
list: phase-ordered, status-coloured, soft phase signals. Expandable
rows reveal BOM inline and linked Job Items. Add Work Order panel with
Job Item checkbox selection. BOM management with material catalogue
search. Print Traveller button generates report with QR code and sets
status to Ready.

**Form 4 --- Manpower (frm_Manpower)**

Directional planning. Top: build window summary. Left: phase breakdown
with progress bars. Right: confirmed crew list with days, week selector,
day rate, cross-job conflict warnings. Gap analysis bar showing phase
shortfalls.

**6.3 Mobile Interface**

Accessed via phone browser over internal WiFi, or by scanning QR code on
traveller.

**Main View --- Task List**

Two toggle filters: MY TASKS (default) and ALL TASKS. Shows Work Orders
with status Ready or In-Progress. Each card shows activity verb,
description, scope item name, estimated hours, and who is currently
working. Phase signal text if predecessor incomplete.

**Button Logic**

  --------------- ------------------- -----------------------------------
  **WO Status**   **My Situation**    **Button Shown**

  Ready           Not on it           START --- creates first time entry,
                                      WO moves to In-Progress

  In-Progress     No open time entry  JOIN --- creates new time entry,
                                      joins the team

  In-Progress     I have an open      LOG MY HOURS --- closes my time
                  entry               entry. Plus MARK COMPLETE (enabled
                                      only when no open entries remain
                                      across all people)
  --------------- ------------------- -----------------------------------

**LOG MY HOURS Flow**

Bottom sheet slides up: actual hours field (pre-filled from timestamps,
editable), optional flag note (two sentences max), confirm button. Under
15 seconds of interaction.

**MARK COMPLETE Flow**

Only enabled when all time entries on this WO are closed. Mandatory
photo (camera opens, one tap). Completion confirmed. WO status moves to
Complete.

**Site Photo Mode**

Lightweight screen showing Workshop Complete Scope Items with camera
button next to each. PM or site crew takes photos directly from phone on
site. Removes the transfer-photos-from-phone-to-desktop step.

**6.4 Main Dashboard**

First screen on PM login. Three action panels requiring daily attention:

**1. Procurement Actions:** BOM items needing ordering across all active
jobs.

**2. Freelancer Flags:** Completed time entries with unreviewed flag
notes.

**3. Modified Scope:** Scope Items with Modified status and count of
flagged open WOs.

Jobs strip at top: horizontal scrolling cards, traffic light by days
remaining (green \>14 days, amber 8--14, red ≤7). Quick stats bar:
active jobs, open WOs, items to order, unread flags. Awaiting Site
Photos count per job where Workshop Complete items exist.

**Part 7: Open Issues & Phase 2**

**7.1 Pre Go-Live (Must Resolve)**

  ---------------------- ------------ -------------------------------------
  **Issue**              **Status**   **Notes**

  Photo storage          Pre go-live  Internal servers confirmed. WiFi-only
  infrastructure                      confirmed. Retention policy, backup
                                      strategy, storage cost projection
                                      needed. Auto-compress on upload
                                      recommended (reduce to 1-2MB).

  PM user accounts       Pre go-live  Access scope defined (attachments +
                                      pm_note fields only). Login mechanism
                                      not specified.

  Kit List export format Pre go-live  Export flag and timestamp exist on
                                      tbl_Job_Items. Format mapping to
                                      existing Kit List system needs
                                      defining.

  Category Prompt        Pre go-live  tbl_Category_Prompts exists but is
  population                          empty. Needs real typical components
                                      for Bar, Stage, DJ Booth etc.

  Quote database         Pre go-live  Linked table import designed. Exact
  structure confirmation              field names and heading hierarchy
                                      storage in source database to be
                                      confirmed with administrator.

  QR code VBA library    Pre go-live  Library identified and tested for
  selection                           generating QR codes in Access
                                      reports.

  Standard stock lengths Pre go-live  Required for cut list optimisation
  per material                        algorithm. Timber lengths, sheet
                                      sizes.
  ---------------------- ------------ -------------------------------------

**7.2 Phase 2 (Deferred)**

  ----------------------- -----------------------------------------------
  **Issue**               **Notes**

  Multi-job resource      Single-job capacity works from
  conflicts               estimated_duration_hrs. Form 4 has lightweight
                          cross-job check (same person same week). Full
                          availability calendar on tbl_Freelancers
                          deferred.

  Precedent search        All fields captured from day one. Search UI
  interface               across verb, complexity, finish, material,
                          photos to be built once dataset is sufficient.

  Running stock levels    Materials catalogue and price history in
                          Phase 1. Actual inventory tracking (stock
                          in/out movements) deferred until scale warrants
                          a dedicated stores function.

  Cut list material       CSV import from SketchUp in Phase 1.
  optimisation            Optimisation algorithm (1D for timber, 2D for
                          sheet goods) to be built in VBA.
  ----------------------- -----------------------------------------------

*Starlight Production System --- Consolidated Design Document v3.0*

*Confidential Internal Document*
