To allow customers (App Developers) to create their own catalogs easily, you need to provide clear instructions and structure for them. Since Freesail is an SDK, developers will be integrating it into their own projects and potentially creating custom UI components that work with your system.

Here are the step-by-step instructions you can pass to the coding agent to enable this capability. This involves creating a guide, a template, and ensuring the SDK exports the necessary utilities.

### **Instructions for Coding Agent**

**Goal:** Enable external developers to create custom catalogs (schema \+ React components) and register them with the Freesail SDK.

#### **1\. Create a Catalog Definition Interface**

Ensure @freesail/react exports a clear interface for what a "Catalog" object looks like. This will be the contract developers implement.

* **File:** packages/react/src/types.ts (create if missing)  
* **Content:**  
  TypeScript  
  import { ComponentType } from 'react';

  export interface CatalogDefinition {  
    namespace: string; // Unique namespace for the catalog (e.g., 'myown')  
    schema: any;       // The JSON schema object (catalog.json content)  
    components: Record\<string, ComponentType\<any\>\>; // Map of component names to React components  
  }

* **Export:** Ensure this is exported from packages/react/src/index.ts.

#### **2\. Update FreesailProvider to Accept Custom Catalogs**

Modify the main provider component to accept an array of these catalog definitions. This allows developers to inject their custom catalogs alongside standard ones.

* **File:** packages/react/src/FreesailProvider.tsx  
* **Update:**  
  TypeScript  
  import { CatalogDefinition } from './types';  
  // ... imports

  interface FreesailProviderProps {  
    // ... existing props  
    catalogs?: CatalogDefinition\[\]; // Array of catalog definitions  
  }

  export const FreesailProvider: React.FC\<FreesailProviderProps\> \= ({   
    catalogs \= \[\],   
    children   
  }) \=\> {  
    // Logic to merge 'catalogs' with any default internal catalogs  
    // and register them into the Registry.  
    // ...  
  };

#### **3\. Create a Helper for Component Definition (withCatalog)**

Ensure the withCatalog Higher-Order Component (or hook) is exported. This makes it easy for developers to bind their custom components to their schema.

* **File:** packages/react/src/utils/withCatalog.tsx (or similar)  
* **Export:** Ensure withCatalog is exported from packages/react/src/index.ts.

#### **4\. Create a "Create Catalog" Guide/Template**

Create a documentation file or a template folder structure that shows developers exactly how to build a catalog.

* **File:** docs/CreatingCustomCatalogs.md  
* **Content Outline:**  
  1. **Define Schema:** Create a catalog.json file defining component properties.  
  2. **Create Components:** Write React components.  
  3. **Bind Components:** Use withCatalog(catalog, 'ComponentName')(Component) to link them.  
  4. **Bundle:** Create an index.ts that exports a CatalogDefinition object.  
  5. **Register:** Pass the exported object to FreesailProvider in the app.

#### **5\. Example "MyOwnCatalog" Structure**

The guide should propose a structure like this for the developer's project:

Plaintext

/src  
  /catalogs  
    /myown  
      ├── catalog.json          \# Schema definition  
      ├── index.ts              \# Entry point exporting CatalogDefinition  
      └── /components  
          ├── MyCustomCard.tsx  \# Implementation  
          └── ...

**Example Code for Developer (index.ts):**

TypeScript

import catalog from './catalog.json';  
import MyCustomCard from './components/MyCustomCard';

export const MyOwnCatalog \= {  
  namespace: 'myown',  
  schema: catalog,  
  components: {  
    'MyCustomCard': MyCustomCard  
  }  
};

**Example Code for Developer (App.tsx):**

TypeScript

import { FreesailProvider } from '@freesail/react';  
import { MyOwnCatalog } from './catalogs/myown';

// ...  
\<FreesailProvider catalogs\={\[MyOwnCatalog\]}\>  
  \<App /\>  
\</FreesailProvider\>

### **Action Items for Coding Agent:**

1. Define and export CatalogDefinition interface in @freesail/react.  
2. Update FreesailProvider props to accept catalogs: CatalogDefinition\[\].  
3. Ensure withCatalog utility is public.  
4. Create a sample docs/CreatingCustomCatalogs.md with the code snippets above.